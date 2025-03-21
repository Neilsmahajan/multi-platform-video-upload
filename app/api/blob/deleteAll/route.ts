import { list, del } from "@vercel/blob";
import { NextResponse } from "next/server";

// Add interface for list result.
interface BlobData {
  url: string;
}
interface ListResult {
  blobs: BlobData[];
  cursor?: string;
}

export async function DELETE() {
  try {
    let cursor: string | undefined = undefined;
    do {
      const listResult: ListResult = await list({ cursor, limit: 1000 });
      if (listResult.blobs.length > 0) {
        await del(listResult.blobs.map((blob) => blob.url));
      }
      cursor = listResult.cursor;
    } while (cursor);
    return NextResponse.json({ message: "All blobs deleted successfully" });
  } catch (error) {
    console.error("An error occurred:", error);
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}
