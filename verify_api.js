const axios = require('axios');

async function test() {
  console.log("test running...");
  
  // 1. Auth Check
  console.log("\n--- Testing Authorization ---");
  try {
    const authRes = await axios.post('http://localhost:3000/api/authorize', {
       principal: "arn:aws:iam::123456789012:user/testuser",
       resource: "arn:aws:s3:::bucket/file",
       action: "s3:GetObject",
       cloudProvider: "aws"
    });
    console.log("✅ Auth Status:", authRes.status);
    console.log("✅ Mode:", authRes.data.authorizationMode);
  } catch(e) {
    console.error("❌ Auth Failed:", e.message);
    if(e.response) {
        console.error("   Details:", e.response.data);
    } else {
        console.error("   Is the server running?");
    }
  }

  // 2. S3 Upload Check (The critical part for AWS account)
  console.log("\n--- Testing S3 Upload ---");
  try {
    const uploadRes = await axios.post('http://localhost:3000/api/s3/upload', {
       key: "verify_upload.txt",
       content: Buffer.from("Integration Verified at " + new Date().toISOString()).toString('base64'),
       bucket: "verify-bucket-" + Date.now()
    });
    console.log("✅ Upload Status:", uploadRes.status);
    console.log("✅ Upload Data:", uploadRes.data);
  } catch(e) {
    console.error("❌ Upload Failed:", e.message);
    if(e.response) {
        console.error("   Details:", e.response.data);
    }
  }
}
test();
