import requests
import sys
from datetime import datetime
import json

class BhabhiGameAPITester:
    def __init__(self, base_url="https://cardgame-preview.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None
        self.room_code = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)

            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "api/", 200)

    def test_register(self):
        """Test user registration"""
        timestamp = datetime.now().strftime('%H%M%S')
        test_data = {
            "username": f"testuser_{timestamp}",
            "email": f"test_{timestamp}@example.com",
            "password": "TestPass123!"
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "api/auth/register",
            200,
            data=test_data
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   ✅ Token received: {self.token[:20]}...")
            print(f"   ✅ User ID: {self.user_id}")
            return True
        return False

    def test_login(self):
        """Test user login with existing credentials"""
        # Try to login with the registered user
        if not hasattr(self, 'test_email'):
            print("❌ No test email available for login test")
            return False
            
        test_data = {
            "email": self.test_email,
            "password": "TestPass123!"
        }
        
        success, response = self.run_test(
            "User Login",
            "POST", 
            "api/auth/login",
            200,
            data=test_data
        )
        
        if success and 'token' in response:
            self.token = response['token']
            return True
        return False

    def test_get_me(self):
        """Test getting current user info"""
        if not self.token:
            print("❌ No token available for /me test")
            return False
            
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "api/auth/me", 
            200
        )
        return success

    def test_create_room(self):
        """Test room creation"""
        if not self.token:
            print("❌ No token available for room creation")
            return False
            
        test_data = {
            "name": "Test Room",
            "max_players": 6
        }
        
        success, response = self.run_test(
            "Create Room",
            "POST",
            "api/rooms/create",
            200,
            data=test_data
        )
        
        if success and 'code' in response:
            self.room_code = response['code']
            print(f"   ✅ Room Code: {self.room_code}")
            # Verify room code is 6 characters
            if len(self.room_code) == 6:
                print(f"   ✅ Room code length is correct (6 characters)")
                return True
            else:
                print(f"   ❌ Room code length is incorrect: {len(self.room_code)}")
        return False

    def test_get_room(self):
        """Test getting room details"""
        if not self.token or not self.room_code:
            print("❌ No token or room code available")
            return False
            
        success, response = self.run_test(
            "Get Room Details",
            "GET",
            f"api/rooms/{self.room_code}",
            200
        )
        return success

def main():
    print("🎮 Starting Bhabhi Game API Tests...")
    print("=" * 50)
    
    # Setup
    tester = BhabhiGameAPITester()
    
    # Run tests in sequence
    tests = [
        ("Health Check", tester.test_health_check),
        ("User Registration", tester.test_register),
        ("Get Current User", tester.test_get_me),
        ("Create Room", tester.test_create_room),
        ("Get Room Details", tester.test_get_room),
    ]
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        success = test_func()
        if not success:
            print(f"\n❌ {test_name} failed - stopping further tests")
            break
    
    # Print final results
    print(f"\n{'='*50}")
    print(f"📊 Final Results:")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())