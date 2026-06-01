import { WorkerEnv } from "../types";

// Helper to base64url encode strings/bytes
function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncode(bytes);
}

/**
 * Enterprise Security: RS256 JWT Token generator for Google OAuth2 scope
 * Runs natively in Cloudflare Worker Edge environment using Web Cryptography API.
 */
async function getGoogleAuthToken(serviceAccountJson: string): Promise<string> {
  const account = JSON.parse(serviceAccountJson);
  const privateKeyPem: string = account.private_key;
  const clientEmail: string = account.client_email;

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = stringToBase64Url(JSON.stringify(header));
  const encodedClaim = stringToBase64Url(JSON.stringify(claim));
  const tokenString = `${encodedHeader}.${encodedClaim}`;

  // Standardize RSA private PEM to DER ArrayBuffer
  const cleanPem = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  
  const binaryDer = atob(cleanPem);
  const derBuffer = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    derBuffer[i] = binaryDer.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    derBuffer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(tokenString)
  );

  const base64UrlSig = base64UrlEncode(new Uint8Array(signature));
  const jwt = `${tokenString}.${base64UrlSig}`;

  // Post to Google OAuth2 exchange endpoint
  const tokenUrl = "https://oauth2.googleapis.com/token";
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange Google OAuth JWT: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Direct mapping utilities for Firestore REST JSON format
 */
export function fromFirestoreValue(val: any): any {
  if (!val) return null;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return parseFloat(val.doubleValue);
  if ("booleanValue" in val) return val.booleanValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    const values = val.arrayValue.values || [];
    return values.map((v: any) => fromFirestoreValue(v));
  }
  if ("mapValue" in val) {
    return fromFirestoreFields(val.mapValue.fields || {});
  }
  return null;
}

export function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = fromFirestoreValue(val);
  }
  return result;
}

export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      return { integerValue: val.toString() };
    }
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((v) => toFirestoreValue(v)),
      },
    };
  }
  if (typeof val === "object") {
    return {
      mapValue: {
        fields: toFirestoreFields(val),
      },
    };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(val);
  }
  return fields;
}

export class FirestoreServiceClient {
  private projectId: string;
  private env: WorkerEnv;
  private cachedToken: { token: string; expires: number } | null = null;

  constructor(env: WorkerEnv) {
    this.projectId = env.FIREBASE_PROJECT_ID;
    this.env = env;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const now = Date.now();
      if (this.cachedToken && this.cachedToken.expires > now) {
        headers["Authorization"] = `Bearer ${this.cachedToken.token}`;
      } else {
        try {
          const token = await getGoogleAuthToken(this.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          this.cachedToken = { token, expires: now + 50 * 60 * 1000 }; // 50 mins expiry
          headers["Authorization"] = `Bearer ${token}`;
        } catch (error: any) {
          console.error("Firestore Auth Token exchange failed, proceeding without authentication: ", error.message);
        }
      }
    }
    return headers;
  }

  private getBaseUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  /**
   * Recovers document from Firestore
   */
  async getDocument<T = any>(collection: string, docId: string): Promise<T | null> {
    const url = `${this.getBaseUrl()}/${collection}/${docId}`;
    const headers = await this.getAuthHeaders();
    
    const res = await fetch(url, { method: "GET", headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Firestore getDocument failed (${res.status}): ${await res.text()}`);
    }
    const rawDoc = (await res.json()) as { name: string; fields?: Record<string, any> };
    return {
      id: docId,
      ...fromFirestoreFields(rawDoc.fields || {}),
    } as any;
  }

  /**
   * Lists any Firestore collection documents
   */
  async listDocuments<T = any>(collection: string): Promise<T[]> {
    const url = `${this.getBaseUrl()}/${collection}`;
    const headers = await this.getAuthHeaders();

    const res = await fetch(url, { method: "GET", headers });
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new Error(`Firestore listDocuments failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { documents?: Array<{ name: string; fields?: Record<string, any> }> };
    const docs = data.documents || [];
    return docs.map((doc) => {
      const parts = doc.name.split("/");
      const id = parts[parts.length - 1];
      return {
        id,
        ...fromFirestoreFields(doc.fields || {}),
      } as any;
    });
  }

  /**
   * Inserts/creates a document inside collection with automatic or specific ID
   */
  async createDocument<T = any>(collection: string, data: Record<string, any>, customDocId?: string): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const headers = await this.getAuthHeaders();
    
    let url = `${baseUrl}/${collection}`;
    if (customDocId) {
      url = `${baseUrl}/${collection}?documentId=${customDocId}`;
    }

    const payload = {
      fields: toFirestoreFields(data),
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Firestore createDocument failed (${res.status}): ${await res.text()}`);
    }

    const rawDoc = (await res.json()) as { name: string; fields?: Record<string, any> };
    const parts = rawDoc.name.split("/");
    const id = parts[parts.length - 1];

    return {
      id,
      ...fromFirestoreFields(rawDoc.fields || {}),
    } as any;
  }

  /**
   * Overwrites or updates specific fields of a Firestore document (Upsert)
   */
  async updateDocument<T = any>(collection: string, docId: string, data: Record<string, any>): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const headers = await this.getAuthHeaders();
    
    // Using PATCH to upsert the fields. updateMask specifies which fields are updated.
    const searchParams = new URLSearchParams();
    searchParams.set("currentDocument.exists", "true"); // Ensures it exists. To upsert freely, omit or check error.
    
    // Add each field path we are updating to query params
    for (const key of Object.keys(data)) {
      searchParams.append("updateMask.fieldPaths", key);
    }

    const url = `${baseUrl}/${collection}/${docId}?${searchParams.toString()}`;
    const payload = {
      fields: toFirestoreFields(data),
    };

    const res = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.status === 404 || !res.ok) {
      // If document doesn't exist, fall back to writing it as a brand new document with customDocId
      return this.createDocument(collection, data, docId);
    }

    const rawDoc = (await res.json()) as { name: string; fields?: Record<string, any> };
    return {
      id: docId,
      ...fromFirestoreFields(rawDoc.fields || {}),
    } as any;
  }

  /**
   * Deletes a Firestore document
   */
  async deleteDocument(collection: string, docId: string): Promise<void> {
    const url = `${this.getBaseUrl()}/${collection}/${docId}`;
    const headers = await this.getAuthHeaders();

    const res = await fetch(url, {
      method: "DELETE",
      headers,
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`Firestore deleteDocument failed (${res.status}): ${await res.text()}`);
    }
  }
}
