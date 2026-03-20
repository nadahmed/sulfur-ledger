import { config } from "dotenv";
import path from "path";

// Load .env.local from the project root
config({ path: path.resolve(process.cwd(), ".env.local") });

// Clear any global AWS environment variables that might interfere with the SDK's credential resolution
// delete process.env.AWS_ACCESS_KEY_ID;
// delete process.env.AWS_SECRET_ACCESS_KEY;
// delete process.env.AWS_SESSION_TOKEN;
// delete process.env.AWS_PROFILE;
// delete process.env.AWS_REGION;

console.log("Environment variables loaded from .env.local and global AWS defaults cleared");
