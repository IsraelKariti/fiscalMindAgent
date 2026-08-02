import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { Readable } from 'node:stream';
import { env } from '../config/env.js';

// The container is created lazily on first use so the web/worker/CLI can boot
// without storage being reachable; a failed init is retried on the next call.
let containerPromise: Promise<ContainerClient> | null = null;

function getContainer(): Promise<ContainerClient> {
  if (!containerPromise) {
    containerPromise = (async () => {
      const service = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
      const container = service.getContainerClient(env.AZURE_STORAGE_CONTAINER);
      await container.createIfNotExists(); // no public access — reads go through the API
      return container;
    })().catch((err) => {
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

/** Uploads (or overwrites — keys are deterministic so retries converge) a document blob. */
export async function uploadBlob(key: string, body: Buffer, contentType: string): Promise<void> {
  const container = await getContainer();
  await container.getBlockBlobClient(key).uploadData(body, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function deleteBlob(key: string): Promise<void> {
  const container = await getContainer();
  await container.getBlockBlobClient(key).deleteIfExists();
}

/** Every blob under a prefix with its creation time — retention sweeps over small namespaces (debug artifacts). */
export async function listBlobs(prefix: string): Promise<Array<{ key: string; createdOn: Date | null }>> {
  const container = await getContainer();
  const blobs: Array<{ key: string; createdOn: Date | null }> = [];
  for await (const item of container.listBlobsFlat({ prefix })) {
    blobs.push({ key: item.name, createdOn: item.properties.createdOn ?? null });
  }
  return blobs;
}

export interface BlobDownload {
  stream: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}

export async function downloadBlob(key: string): Promise<BlobDownload> {
  const container = await getContainer();
  const response = await container.getBlockBlobClient(key).download();
  if (!response.readableStreamBody) throw new Error(`downloadBlob: no stream for ${key}`);
  return {
    stream: response.readableStreamBody as Readable,
    contentType: response.contentType,
    contentLength: response.contentLength,
  };
}
