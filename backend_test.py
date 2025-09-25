#!/usr/bin/env python3
"""
Backend API Testing for AI Sales System - Dos Anjos Engenharia
Tests all CRUD operations and AI integration functionality
"""

import requests
import sys
import json
from datetime import datetime
import uuid

class SalesSystemAPITester:
    def __init__(self, base_url="https://sales-copilot-10.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.created_client_id = None

    def log_test(self, name, success, details="", endpoint=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test_name": name,
            "success": success,
            "endpoint": endpoint,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"\n{status} - {name}")
        if endpoint:
            print(f"   Endpoint: {endpoint}")
        if details:
            print(f"   Details: {details}")

    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                expected_message = "Sistema IA Vendas - Dos Anjos Engenharia"
                success = expected_message in data.get("message", "")
                details = f"Status: {response.status_code}, Message: {data.get('message', 'N/A')}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                
            self.log_test("API Root Endpoint", success, details, "GET /api/")
            return success
            
        except Exception as e:
            self.log_test("API Root Endpoint", False, f"Exception: {str(e)}", "GET /api/")
            return False

    def test_create_client(self):
        """Test client creation endpoint"""
        try:
            test_client = {
                "company_name": "Metalúrgica Teste API Ltda",
                "business_area": "industrial",
                "company_size": "media",
                "location": "São Paulo - SP",
                "contact_name": "João Silva",
                "contact_role": "Gerente de Operações",
                "contact_phone": "(11) 99999-8888",
                "contact_type": "decisor"
            }
            
            response = requests.post(f"{self.api_url}/clients", json=test_client, timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.created_client_id = data.get("id")
                success = (
                    data.get("company_name") == test_client["company_name"] and
                    len(data.get("contacts", [])) == 1 and
                    data["contacts"][0]["name"] == test_client["contact_name"]
                )
                details = f"Status: {response.status_code}, Client ID: {self.created_client_id}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                
            self.log_test("Create Client", success, details, "POST /api/clients")
            return success
            
        except Exception as e:
            self.log_test("Create Client", False, f"Exception: {str(e)}", "POST /api/clients")
            return False

    def test_get_clients(self):
        """Test get all clients endpoint"""
        try:
            response = requests.get(f"{self.api_url}/clients", timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                success = isinstance(data, list) and len(data) > 0
                details = f"Status: {response.status_code}, Clients found: {len(data)}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                
            self.log_test("Get All Clients", success, details, "GET /api/clients")
            return success
            
        except Exception as e:
            self.log_test("Get All Clients", False, f"Exception: {str(e)}", "GET /api/clients")
            return False

    def test_get_client_by_id(self):
        """Test get specific client endpoint"""
        if not self.created_client_id:
            self.log_test("Get Client by ID", False, "No client ID available", "GET /api/clients/{id}")
            return False
            
        try:
            response = requests.get(f"{self.api_url}/clients/{self.created_client_id}", timeout=10)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                success = (
                    data.get("id") == self.created_client_id and
                    data.get("company_name") == "Metalúrgica Teste API Ltda"
                )
                details = f"Status: {response.status_code}, Company: {data.get('company_name')}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                
            self.log_test("Get Client by ID", success, details, f"GET /api/clients/{self.created_client_id}")
            return success
            
        except Exception as e:
            self.log_test("Get Client by ID", False, f"Exception: {str(e)}", f"GET /api/clients/{self.created_client_id}")
            return False

    def test_add_contact(self):
        """Test adding contact to existing client"""
        if not self.created_client_id:
            self.log_test("Add Contact", False, "No client ID available", "POST /api/clients/{id}/contacts")
            return False
            
        try:
            new_contact = {
                "client_id": self.created_client_id,
                "name": "Maria Santos",
                "role": "Diretora Técnica",
                "phone": "(11) 88888-7777",
                "contact_type": "influenciador"
            }
            
            response = requests.post(
                f"{self.api_url}/clients/{self.created_client_id}/contacts", 
                json=new_contact, 
                timeout=10
            )
            success = response.status_code == 200
            
            if success:
                data = response.json()
                success = len(data.get("contacts", [])) == 2  # Should have 2 contacts now
                details = f"Status: {response.status_code}, Total contacts: {len(data.get('contacts', []))}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                
            self.log_test("Add Contact", success, details, f"POST /api/clients/{self.created_client_id}/contacts")
            return success
            
        except Exception as e:
            self.log_test("Add Contact", False, f"Exception: {str(e)}", f"POST /api/clients/{self.created_client_id}/contacts")
            return False

    def test_ai_conversation_analysis(self):
        """Test AI conversation analysis endpoint"""
        if not self.created_client_id:
            self.log_test("AI Conversation Analysis", False, "No client ID available", "POST /api/analyze-conversation")
            return False
            
        try:
            session_id = str(uuid.uuid4())
            analysis_request = {
                "client_id": self.created_client_id,
                "session_id": session_id,
                "speech_text": "Olá, estamos precisando de um acompanhamento técnico para nossa nova obra industrial. Vocês trabalham com esse tipo de projeto?"
            }
            
            response = requests.post(
                f"{self.api_url}/analyze-conversation", 
                json=analysis_request, 
                timeout=30  # AI calls may take longer
            )
            success = response.status_code == 200
            
            if success:
                data = response.json()
                required_fields = ["suggestions", "analysis", "next_steps", "sentiment_score", "call_flow_status"]
                success = all(field in data for field in required_fields)
                
                if success:
                    suggestions_count = len(data.get("suggestions", []))
                    sentiment = data.get("sentiment_score", 0)
                    details = f"Status: {response.status_code}, Suggestions: {suggestions_count}, Sentiment: {sentiment}%"
                else:
                    details = f"Status: {response.status_code}, Missing fields in response"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                
            self.log_test("AI Conversation Analysis", success, details, "POST /api/analyze-conversation")
            return success
            
        except Exception as e:
            self.log_test("AI Conversation Analysis", False, f"Exception: {str(e)}", "POST /api/analyze-conversation")
            return False

    def test_conversation_history(self):
        """Test conversation history retrieval"""
        if not self.created_client_id:
            self.log_test("Get Conversation History", False, "No client ID available", "GET /api/conversations/{client_id}/{session_id}")
            return False
            
        try:
            # Use a session ID that should have messages from the AI analysis test
            session_id = str(uuid.uuid4())
            
            response = requests.get(
                f"{self.api_url}/conversations/{self.created_client_id}/{session_id}", 
                timeout=10
            )
            success = response.status_code == 200
            
            if success:
                data = response.json()
                success = isinstance(data, list)  # Should return a list even if empty
                details = f"Status: {response.status_code}, Messages: {len(data)}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text[:200]}"
                
            self.log_test("Get Conversation History", success, details, f"GET /api/conversations/{self.created_client_id}/{session_id}")
            return success
            
        except Exception as e:
            self.log_test("Get Conversation History", False, f"Exception: {str(e)}", f"GET /api/conversations/{self.created_client_id}/{session_id}")
            return False

    def test_error_handling(self):
        """Test error handling for invalid requests"""
        try:
            # Test getting non-existent client
            response = requests.get(f"{self.api_url}/clients/invalid-id", timeout=10)
            success = response.status_code == 404
            
            details = f"Status: {response.status_code} (expected 404)"
            self.log_test("Error Handling - Invalid Client ID", success, details, "GET /api/clients/invalid-id")
            return success
            
        except Exception as e:
            self.log_test("Error Handling - Invalid Client ID", False, f"Exception: {str(e)}", "GET /api/clients/invalid-id")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests for AI Sales System")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Test sequence
        tests = [
            self.test_api_root,
            self.test_create_client,
            self.test_get_clients,
            self.test_get_client_by_id,
            self.test_add_contact,
            self.test_ai_conversation_analysis,
            self.test_conversation_history,
            self.test_error_handling
        ]
        
        for test in tests:
            test()
        
        # Summary
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY")
        print(f"✅ Passed: {self.tests_passed}/{self.tests_run}")
        print(f"❌ Failed: {self.tests_run - self.tests_passed}/{self.tests_run}")
        print(f"📈 Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed! Backend is working correctly.")
            return 0
        else:
            print("⚠️  Some tests failed. Check the details above.")
            return 1

def main():
    tester = SalesSystemAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())