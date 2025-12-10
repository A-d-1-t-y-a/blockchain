const axios = require('axios');
const fs = require('fs');

async function runTests() {
  const report = [];
  report.push("# API & System Verification Report");
  report.push(`Date: ${new Date().toISOString()}`);
  report.push("");
  
  console.log("Running Health Check...");
  // 1. Health
  try {
      const res = await axios.get('http://localhost:3000/health');
      report.push(`## 1. Health Check`);
      report.push(`- **Status**: ${res.status}`);
      report.push(`- **System Status**: ${res.data.status}`);
      report.push("```json");
      report.push(JSON.stringify(res.data.services, null, 2));
      report.push("```");
  } catch(e) { 
      report.push(`## 1. Health Check\n- **FAILED**: ${e.message}`); 
  }

  console.log("Running Authorization Test...");
  // 2. Authorization (Blockchain Primary)
  try {
      const res = await axios.post('http://localhost:3000/api/authorize', {
          principal: "arn:aws:iam::123456789012:user/report-bot",
          resource: "arn:aws:s3:::report-bucket/data.csv",
          action: "s3:GetObject",
          cloudProvider: "aws"
      });
      report.push(`## 2. Authorization Test`);
      report.push(`- **Status**: ${res.status}`);
      report.push(`- **Mode**: ${res.data.authorizationMode}`);
      report.push(`- **Authorized**: ${res.data.authorized}`);
      report.push(`- **Reason**: ${res.data.authorizationReason}`);
      report.push(`- **Blockchain Result**: ${res.data.blockchainResult ? (res.data.blockchainResult.authorized ? 'Approved' : 'Denied') : 'N/A'}`);
  } catch(e) {
      report.push(`## 2. Authorization Test\n- **FAILED**: ${e.message}`);
      if(e.response && e.response.data) {
          report.push("```json");
          report.push(JSON.stringify(e.response.data, null, 2));
          report.push("```");
      }
  }

  console.log("Running S3 Verification...");
  // 3. S3 Upload
  try {
      const filename = `report-test-${Date.now()}.txt`;
      const res = await axios.post('http://localhost:3000/api/s3/upload', {
          key: filename,
          content: Buffer.from("Report Verification Content").toString('base64'),
          bucket: "report-verification-bucket-" + Date.now()
      });
      report.push(`## 3. S3 Upload Verification`);
      report.push(`- **Status**: ${res.status}`);
      report.push(`- **Success**: ${res.data.success}`);
      report.push(`- **Method**: ${res.data.method}`);
      report.push(`- **Target**: s3://${res.data.bucket}/${res.data.key}`);
  } catch(e) {
       report.push(`## 3. S3 Upload Verification\n- **FAILED**: ${e.message}`);
       if(e.response && e.response.data) {
           report.push("```json");
           report.push(JSON.stringify(e.response.data, null, 2));
           report.push("```");
       }
  }

  const finalReport = report.join("\n");
  fs.writeFileSync('test_metrics_report.md', finalReport);
  console.log("Report generated: test_metrics_report.md");
}
runTests();
