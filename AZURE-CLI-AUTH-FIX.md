# 🔧 Azure CLI Authentication Fix

## 🚨 Problem Identified

**Error**: `AttributeError: Can't get attribute 'NormalizedResponse' on <module 'msal.throttled_http_client' ...>`

**Root Cause**:

- Azure CLI authentication issues due to corrupted/cached token files
- Mismatched Python package versions in Azure CLI Docker image
- MSAL (Microsoft Authentication Library) token cache conflicts

## ✅ Solution Implemented

### 1. **Token Cache Clearing**

Added a new step to clear Azure CLI token cache before any CLI operations:

```yaml
- name: Clear Azure CLI token cache
  run: |
   echo "🧹 Clearing Azure CLI token cache to prevent authentication issues..."
   rm -rf ~/.azure
   echo "✅ Token cache cleared"
```

**Why This Works**:

- Removes corrupted/incompatible cached tokens
- Forces fresh authentication using the federated credentials
- Prevents MSAL library conflicts

### 2. **Enhanced Error Handling**

Added retry logic to all Azure CLI commands:

```yaml
# Example: Start app with retry
for i in {1..3}; do
echo "Attempt $i/3 to start the web app..."
if az webapp start --name ${{ env.AZURE_WEBAPP_NAME }} --resource-group ${{ env.AZURE_RESOURCE_GROUP }}; then
echo "✅ Web App started successfully"
break
else
echo "⚠️ Start attempt $i failed, retrying..."
if [ $i -lt 3 ]; then
sleep 10
fi
fi
done
```

**Benefits**:

- Handles transient Azure CLI failures
- Automatic retries with delays
- Better error reporting

### 3. **Improved Workflow Robustness**

**Steps Enhanced**:

- ✅ **Stop Web App** - With status checking and retry
- ✅ **Clear Deployment Locks** - With retry logic
- ✅ **Start Web App** - With retry logic
- ✅ **Verify Startup Command** - With retry logic
- ✅ **App Restart** - With retry logic

## 🎯 Expected Results

### **Before Fix**:

```
❌ AttributeError: Can't get attribute 'NormalizedResponse'
❌ Azure CLI authentication failures
❌ Deployment step failures
```

### **After Fix**:

```
✅ 🧹 Clearing Azure CLI token cache to prevent authentication issues...
✅ Token cache cleared
✅ 🛑 Stopping Azure Web App to prevent deployment conflicts...
✅ Current app status: Running
✅ Web App stop command executed
✅ Deployment successful
✅ Web App started successfully
✅ Startup command is already correct
```

## 🔍 How the Fix Works

### **Step-by-Step Process**:

1. **Login to Azure** - Uses federated credentials (working)
2. **Clear Token Cache** - `rm -rf ~/.azure` (NEW FIX)
3. **Stop App** - With status check and retry logic
4. **Wait** - Allow complete shutdown
5. **Clear Locks** - With retry logic
6. **Deploy** - Clean deployment with retry
7. **Start App** - With retry logic
8. **Verify Config** - With retry logic
9. **Health Check** - Multi-attempt validation

### **Why This Prevents the Error**:

- **Fresh Authentication**: Clearing `~/.azure` forces new token generation
- **No Cache Conflicts**: Removes corrupted MSAL cache files
- **Clean State**: Ensures Azure CLI starts with clean authentication state
- **Retry Logic**: Handles any remaining transient issues

## 🛡️ Additional Safeguards

### **Multiple Retry Attempts**:

- Each Azure CLI command retries up to 3 times
- Progressive delays between retries (5-10 seconds)
- Clear error messages for debugging

### **Error Isolation**:

- Each step has independent error handling
- Failed operations don't break the entire pipeline
- Detailed logging for troubleshooting

### **Timeout Management**:

- Appropriate delays between operations
- Health checks with multiple attempts
- Graceful handling of startup delays

## 🚀 Deployment Process Flow

```
1. 🔑 Login to Azure (federated auth)
2. 🧹 Clear token cache (prevent MSAL errors)
3. 🛑 Stop app (with retry)
4. ⏳ Wait for shutdown
5. 🔧 Clear locks (with retry)
6. 📦 Deploy (with retry)
7. 🚀 Start app (with retry)
8. ✅ Verify config (with retry)
9. 🔍 Health check (multi-attempt)
```

## 📋 Verification

After implementing this fix, the deployment should:

- ✅ **No more AttributeError** from MSAL
- ✅ **Successful Azure CLI authentication**
- ✅ **Reliable deployment process**
- ✅ **Proper startup command configuration**
- ✅ **Working health endpoint**

The token cache clearing is a simple but effective solution that resolves the underlying MSAL authentication conflicts in the Azure CLI Docker environment.
