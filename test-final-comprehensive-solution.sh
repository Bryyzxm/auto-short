#!/bin/bash

# ==============================================================================
# FINAL COMPREHENSIVE SOLUTION TEST SCRIPT
# ==============================================================================
# Tests all implemented Azure production fixes and monitoring endpoints
# Created: 2025-09-01
# Purpose: Complete validation of comprehensive Azure solution
# ==============================================================================

echo "=============================================================="
echo "🧪 FINAL COMPREHENSIVE SOLUTION TEST"
echo "=============================================================="
echo "📅 Started: $(date)"
echo ""

# Configuration
SERVER_URL="http://localhost:8080"
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test helper functions
test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local data="$5"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "🔍 Testing $test_name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "%{http_code}" -o response.tmp "$SERVER_URL$endpoint")
    else
        if [ -n "$data" ]; then
            response=$(curl -s -w "%{http_code}" -o response.tmp -X "$method" -H "Content-Type: application/json" -d "$data" "$SERVER_URL$endpoint")
        else
            response=$(curl -s -w "%{http_code}" -o response.tmp -X "$method" "$SERVER_URL$endpoint")
        fi
    fi
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL (Status: $response, Expected: $expected_status)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "Response content:"
        cat response.tmp | head -3
        echo ""
        return 1
    fi
}

test_json_response() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_key="$4"
    local data="$5"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "🔍 Testing $test_name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s "$SERVER_URL$endpoint")
    else
        if [ -n "$data" ]; then
            response=$(curl -s -X "$method" -H "Content-Type: application/json" -d "$data" "$SERVER_URL$endpoint")
        else
            response=$(curl -s -X "$method" "$SERVER_URL$endpoint")
        fi
    fi
    
    # Check if response contains the expected key (simple string check)
    if echo "$response" | grep -q "\"$expected_key\""; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL (Missing key: $expected_key)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "Response: $response" | head -100
        echo ""
        return 1
    fi
}

echo "🌐 Testing server availability..."
if ! curl -s "$SERVER_URL" > /dev/null; then
    echo -e "${RED}❌ Server is not running at $SERVER_URL${NC}"
    echo "Please start the server first: npm start"
    exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo ""

echo "=============================================================="
echo "📊 TESTING COMPREHENSIVE MONITORING ENDPOINTS"
echo "=============================================================="

# Test diagnostics endpoint
test_json_response "Diagnostics Endpoint" "GET" "/api/diagnostics" "timestamp"

# Test rate limiter stats
test_json_response "Rate Limiter Stats" "GET" "/api/rate-limiter/stats" "stats"

# Test cookies validation
test_json_response "Cookies Validation" "GET" "/api/cookies/validate" "valid"

# Test video access check (expect failure is normal)
echo -n "🔍 Testing Video Access Check... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))
response=$(curl -s "$SERVER_URL/api/video-access-check?videoId=dQw4w9WgXcQ")
if echo "$response" | grep -q "\"accessible\""; then
    echo -e "${GREEN}✅ PASS (Endpoint functional)${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ FAIL (Invalid JSON response)${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

echo ""
echo "=============================================================="
echo "🔧 TESTING ADMINISTRATIVE ENDPOINTS"
echo "=============================================================="

# Test service reset
test_json_response "Service Reset" "POST" "/api/admin/reset-services" "success"

echo ""
echo "=============================================================="
echo "🔍 TESTING CORE APPLICATION ENDPOINTS"
echo "=============================================================="

# Test health check
echo -n "🔍 Testing Health Check... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))
health_response=$(curl -s -w "%{http_code}" -o response.tmp "http://localhost:8080/api/health")
if [ "$health_response" = "200" ] || [ "$health_response" = "302" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ FAIL (Status: $health_response, Expected: 200 or 302)${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    echo "Response content:"
    cat response.tmp | head -3
    echo ""
fi

# Test server root
test_endpoint "Server Root" "GET" "/" "200"

echo ""
echo "=============================================================="
echo "📊 COMPREHENSIVE SOLUTION VALIDATION"
echo "=============================================================="

# Validate Enhanced Services Integration
echo "🔍 Validating Enhanced Services Integration..."

# Check rate limiter integration
echo -n "  📈 Rate Limiter Integration... "
diagnostics_response=$(curl -s "$SERVER_URL/api/diagnostics")
if echo "$diagnostics_response" | grep -q "rateLimiter"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
fi

# Check cookie manager integration
echo -n "  🍪 Cookie Manager Integration... "
if echo "$diagnostics_response" | grep -q "cookieManager"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
fi

# Check FFmpeg integration
echo -n "  🎬 FFmpeg Integration... "
if echo "$diagnostics_response" | grep -q "ffmpeg"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
fi

echo ""
echo "=============================================================="
echo "📋 TEST RESULTS SUMMARY"
echo "=============================================================="

echo "📊 Test Statistics:"
echo "   Total Tests: $TOTAL_TESTS"
echo "   Passed: $PASSED_TESTS"
echo "   Failed: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "🎉 ${GREEN}ALL TESTS PASSED!${NC}"
    echo "✅ Comprehensive Azure solution is ready for deployment"
    echo ""
    echo "🚀 Next Steps:"
    echo "   1. Deploy to Azure using: ./deploy-comprehensive-azure-solution.sh"
    echo "   2. Monitor logs using Azure Log Stream"
    echo "   3. Test production endpoints after deployment"
else
    echo -e "⚠️  ${YELLOW}SOME TESTS FAILED${NC}"
    echo "❌ Please fix failed tests before deploying to Azure"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   1. Check server logs for errors"
    echo "   2. Verify all services are properly initialized"
    echo "   3. Test individual endpoints manually"
fi

# Calculate success rate
if command -v bc >/dev/null 2>&1; then
    success_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l)
    echo "📈 Success Rate: ${success_rate}%"
else
    echo "📈 Success Rate: $PASSED_TESTS/$TOTAL_TESTS tests passed"
fi

echo ""
echo "=============================================================="
echo "🔍 DETAILED SERVICE STATUS"
echo "=============================================================="

# Show detailed diagnostics
echo "📊 Current Service Status:"
curl -s "$SERVER_URL/api/diagnostics" || echo "Unable to fetch detailed diagnostics"

echo ""
echo "🍪 Cookie Status:"
curl -s "$SERVER_URL/api/cookies/validate" || echo "Unable to fetch cookie status"

echo ""
echo "📈 Rate Limiter Status:"
curl -s "$SERVER_URL/api/rate-limiter/stats" || echo "Unable to fetch rate limiter stats"

echo ""
echo "=============================================================="
echo "📅 Test completed: $(date)"
echo "=============================================================="

# Cleanup
rm -f response.tmp

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    exit 0
else
    exit 1
fi
