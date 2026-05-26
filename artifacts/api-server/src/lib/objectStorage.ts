import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { ObjectAclPolicy, ObjectPermission } from "./objectAcl";

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL must be set. Add it to your environment variables.");
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY must be set. Add it to your environment variables.");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "portraits";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const path = `uploads/${objectId}`;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new Error(`Failed to create signed upload URL: ${error?.message}`);
    }

    return data.signedUrl;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    // Extract the UUID from the Supabase signed upload URL.
    // URL path format: /storage/v1/object/upload/sign/<bucket>/uploads/<uuid>
    try {
      const url = new URL(rawPath);
      const parts = url.pathname.split("/");
      const uploadsIdx = parts.indexOf("uploads");
      if (uploadsIdx >= 0 && parts[uploadsIdx + 1]) {
        return `/objects/${parts[uploadsIdx + 1]}`;
      }
    } catch {
      // not a URL — return as-is
    }
    return rawPath;
  }

  async getObjectPublicUrl(objectPath: string): Promise<string> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const entityId = objectPath.slice("/objects/".length);
    const storagePath = `uploads/${entityId}`;
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
  }

  // Kept for API compatibility with storage route
  async getObjectEntityFile(objectPath: string): Promise<string> {
    return this.getObjectPublicUrl(objectPath);
  }

  async searchPublicObject(filePath: string): Promise<string | null> {
    const storagePath = `public/${filePath}`;
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    return data?.publicUrl ?? null;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    _aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    // Supabase bucket-level visibility handles access; no per-object ACL needed.
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity({
    requestedPermission,
  }: {
    userId?: string;
    objectFile: string;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    // Public bucket — all reads are permitted.
    return requestedPermission === ObjectPermission.READ;
  }
}
