export class AzureIAMClient {
  constructor() {}
  
  async checkAccess(request: any): Promise<{ allowed: boolean; reason: string }> {
    return {
      allowed: false,
      reason: "Azure integration not configured"
    };
  }
}
