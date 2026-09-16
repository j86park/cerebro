-- WP-P1.2: pluggable document extract adapter persistence
ALTER TABLE "Document" ADD COLUMN "extractedFields" JSONB;
