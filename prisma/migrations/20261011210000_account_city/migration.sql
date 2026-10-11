-- Sign-up asks customers and merchants for their city as well as their address. Existing
-- accounts have none yet; their address already names the town.
ALTER TABLE "User" ADD COLUMN "city" TEXT;
