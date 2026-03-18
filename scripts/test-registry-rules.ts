import { getRequiredDocs } from "../src/lib/documents/registry";

function testRegistry() {
  console.log("--- Testing Document Registry Rules ---");
  
  const individualDocs = getRequiredDocs("INDIVIDUAL");
  console.log(`Individual Account requires ${individualDocs.length} documents.`);
  const hasCorporateDocsInIndividual = individualDocs.some(d => 
    d === "ARTICLES_OF_INCORPORATION" || d === "AUTHORIZED_SIGNATORY_LIST"
  );
  
  if (hasCorporateDocsInIndividual) {
    throw new Error("FAIL: Individual account should not require corporate docs");
  } else {
    console.log("PASS: Individual account docs look correct.");
  }

  const corporateDocs = getRequiredDocs("CORPORATE");
  console.log(`Corporate Account requires ${corporateDocs.length} documents.`);
  const hasArticles = corporateDocs.includes("ARTICLES_OF_INCORPORATION");
  const hasSignatories = corporateDocs.includes("AUTHORIZED_SIGNATORY_LIST");
  
  if (!hasArticles || !hasSignatories) {
    throw new Error("FAIL: Corporate account missing required corporate docs");
  } else {
    console.log("PASS: Corporate account docs look correct.");
  }

  console.log("--- Registry Rules Verification COMPLETE ---");
}

try {
  testRegistry();
} catch (e) {
  console.error(e);
  process.exit(1);
}
