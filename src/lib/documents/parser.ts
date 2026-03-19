import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import { promises as fs } from "fs";

/**
 * Extracts text content from a PDF file.
 * Returns a clean string of the document text.
 */
export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    
    // Clean up basic whitespace/newlines
    return data.text.replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error(`[Parser] Failed to extract text from ${filePath}:`, error);
    return `[Error] Could not parse document content. ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Simple dispatcher to handle different file types.
 * For now, only PDF is specialized.
 */
export async function extractDocumentText(filePath: string): Promise<string> {
  const extension = filePath.split(".").pop()?.toLowerCase();
  
  if (extension === "pdf") {
    return await extractPdfText(filePath);
  }
  
  // Fallback for non-PDF files
  return `[Non-PDF File] Content extraction not yet implemented for ${extension} files. File name: ${filePath.split("/").pop()}`;
}
