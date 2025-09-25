from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models
class Contact(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str
    phone: str
    contact_type: str  # decisor, influenciador, usuario

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_name: str
    business_area: str
    company_size: str
    location: str
    contacts: List[Contact] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClientCreate(BaseModel):
    company_name: str
    business_area: str
    company_size: str
    location: str
    contact_name: str
    contact_role: str
    contact_phone: str
    contact_type: str

class ContactCreate(BaseModel):
    client_id: str
    name: str
    role: str
    phone: str
    contact_type: str

class ConversationMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    session_id: str
    message_type: str  # client_speech, ai_suggestion, analysis
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ConversationAnalysis(BaseModel):
    client_id: str
    session_id: str
    speech_text: str

class AIResponse(BaseModel):
    suggestions: List[str]
    analysis: str
    next_steps: List[str]
    sentiment_score: int
    call_flow_status: str

# Routes
@api_router.get("/")
async def root():
    return {"message": "Sistema IA Vendas - Dos Anjos Engenharia"}

@api_router.post("/clients", response_model=Client)
async def create_client(input: ClientCreate):
    # Create contact
    contact = Contact(
        name=input.contact_name,
        role=input.contact_role,
        phone=input.contact_phone,
        contact_type=input.contact_type
    )
    
    # Create client
    client = Client(
        company_name=input.company_name,
        business_area=input.business_area,
        company_size=input.company_size,
        location=input.location,
        contacts=[contact]
    )
    
    client_dict = client.dict()
    client_dict['created_at'] = client_dict['created_at'].isoformat()
    
    await db.clients.insert_one(client_dict)
    return client

@api_router.get("/clients", response_model=List[Client])
async def get_clients():
    clients = await db.clients.find().to_list(1000)
    for client in clients:
        if isinstance(client.get('created_at'), str):
            client['created_at'] = datetime.fromisoformat(client['created_at'])
    return [Client(**client) for client in clients]

@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    if isinstance(client.get('created_at'), str):
        client['created_at'] = datetime.fromisoformat(client['created_at'])
    return Client(**client)

@api_router.post("/clients/{client_id}/contacts", response_model=Client)
async def add_contact(client_id: str, contact_data: ContactCreate):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    
    new_contact = Contact(
        name=contact_data.name,
        role=contact_data.role,
        phone=contact_data.phone,
        contact_type=contact_data.contact_type
    )
    
    await db.clients.update_one(
        {"id": client_id},
        {"$push": {"contacts": new_contact.dict()}}
    )
    
    updated_client = await db.clients.find_one({"id": client_id})
    if isinstance(updated_client.get('created_at'), str):
        updated_client['created_at'] = datetime.fromisoformat(updated_client['created_at'])
    return Client(**updated_client)

@api_router.post("/analyze-conversation", response_model=AIResponse)
async def analyze_conversation(analysis: ConversationAnalysis):
    try:
        # Get client info for context
        client = await db.clients.find_one({"id": analysis.client_id})
        if not client:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        
        # Get previous conversation context
        previous_messages = await db.conversation_messages.find({
            "client_id": analysis.client_id,
            "session_id": analysis.session_id
        }).sort("timestamp", -1).limit(5).to_list(5)
        
        # Prepare context for AI
        client_context = f"""
EMPRESA: {client.get('company_name', '')}
ÁREA: {client.get('business_area', '')}
PORTE: {client.get('company_size', '')}
LOCALIZAÇÃO: {client.get('location', '')}

CONTATOS:
"""
        
        for contact in client.get('contacts', []):
            client_context += f"- {contact.get('name', '')} ({contact.get('role', '')}) - {contact.get('contact_type', '').upper()}\n"
        
        conversation_context = ""
        if previous_messages:
            conversation_context = "\nCONVERSA ANTERIOR:\n"
            for msg in reversed(previous_messages):
                conversation_context += f"[{msg.get('message_type', '')}] {msg.get('content', '')}\n"
        
        # System message for sales AI
        system_message = f"""Você é um assistente de IA especializado em vendas técnicas para a empresa DOS ANJOS ENGENHARIA.

OBJETIVO PRINCIPAL: Marcar reunião de apresentação técnica

NOSSOS SERVIÇOS:
- Acompanhamento Técnico de Obras
- Gerenciamento de Projetos  
- Projetos de Engenharia
- Regularizações (AVCB, SPDA)
- Laudos e Vistorias Técnicas
- Levantamentos com Drone
- Engenharia de Segurança
- Consultoria Especializada

CONTEXTO DO CLIENTE:
{client_context}

{conversation_context}

Analise a fala do cliente e forneça:
1. Sugestões práticas para resposta (máximo 3)
2. Análise do sentimento e interesse
3. Próximos passos estratégicos
4. Status do fluxo da ligação

Responda sempre em português brasileiro, sendo prático e focado em MARCAR A REUNIÃO."""

        # Initialize AI chat
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=analysis.session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        # Send analysis request
        user_message = UserMessage(
            text=f"FALA DO CLIENTE: '{analysis.speech_text}'\n\nForneça análise completa e sugestões para continuar a conversa visando marcar reunião técnica."
        )
        
        response = await chat.send_message(user_message)
        
        # Store conversation message
        message = ConversationMessage(
            client_id=analysis.client_id,
            session_id=analysis.session_id,
            message_type="client_speech",
            content=analysis.speech_text
        )
        
        message_dict = message.dict()
        message_dict['timestamp'] = message_dict['timestamp'].isoformat()
        await db.conversation_messages.insert_one(message_dict)
        
        # Store AI response
        ai_message = ConversationMessage(
            client_id=analysis.client_id,
            session_id=analysis.session_id,
            message_type="ai_suggestion",
            content=response
        )
        
        ai_message_dict = ai_message.dict()
        ai_message_dict['timestamp'] = ai_message_dict['timestamp'].isoformat()
        await db.conversation_messages.insert_one(ai_message_dict)
        
        # Parse AI response (simple parsing - could be improved)
        lines = response.split('\n')
        suggestions = []
        analysis_text = response[:200] + "..." if len(response) > 200 else response
        next_steps = ["Continuar explorando necessidades", "Agendar reunião técnica"]
        
        # Extract suggestions from response
        for line in lines:
            if any(keyword in line.lower() for keyword in ['sugest', 'resposta', 'diga', 'pergunte']):
                if line.strip() and len(line.strip()) > 10:
                    suggestions.append(line.strip()[:100])
        
        if not suggestions:
            suggestions = [
                "Explore mais sobre as necessidades técnicas",
                "Questione sobre projetos atuais", 
                "Proponha reunião para apresentação"
            ]
        
        # Calculate sentiment score (basic analysis)
        positive_words = ['interessante', 'bom', 'sim', 'preciso', 'necessário', 'importante']
        negative_words = ['não', 'talvez', 'depois', 'difícil', 'caro', 'complicado']
        
        text_lower = analysis.speech_text.lower()
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)
        
        sentiment_score = max(30, min(95, 65 + (positive_count * 10) - (negative_count * 15)))
        
        return AIResponse(
            suggestions=suggestions[:3],
            analysis=analysis_text,
            next_steps=next_steps,
            sentiment_score=sentiment_score,
            call_flow_status="Em andamento - Explorando necessidades"
        )
        
    except Exception as e:
        logging.error(f"Erro na análise: {str(e)}")
        return AIResponse(
            suggestions=["Erro na análise - Continue naturalmente"],
            analysis=f"Erro no processamento: {str(e)}",
            next_steps=["Reagendar análise"],
            sentiment_score=50,
            call_flow_status="Erro no processamento"
        )

@api_router.get("/conversations/{client_id}/{session_id}")
async def get_conversation_history(client_id: str, session_id: str):
    messages = await db.conversation_messages.find({
        "client_id": client_id,
        "session_id": session_id
    }).sort("timestamp", 1).to_list(100)
    
    for msg in messages:
        if isinstance(msg.get('timestamp'), str):
            msg['timestamp'] = datetime.fromisoformat(msg['timestamp'])
    
    return [ConversationMessage(**msg) for msg in messages]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()