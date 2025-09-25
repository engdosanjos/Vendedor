import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Badge } from "./components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Separator } from "./components/ui/separator";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  // Estados principais
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState("Transcrição em tempo real aparecerá aqui...");
  const [conversationHistory, setConversationHistory] = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [sentimentScore, setSentimentScore] = useState(75);
  const [callFlowStatus, setCallFlowStatus] = useState("Selecione um cliente para iniciar");
  
  // Estados para modais
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  
  // Estados para formulários
  const [newClient, setNewClient] = useState({
    company_name: "",
    business_area: "",
    company_size: "",
    location: "",
    contact_name: "",
    contact_role: "",
    contact_phone: "",
    contact_type: ""
  });
  
  const [newContact, setNewContact] = useState({
    name: "",
    role: "",
    phone: "",
    contact_type: ""
  });
  
  // Reconhecimento de voz
  const recognitionRef = useRef(null);
  const currentSessionId = useRef(null);

  // Carrega clientes na inicialização
  useEffect(() => {
    loadClients();
    initSpeechRecognition();
  }, []);

  // Funções API
  const loadClients = async () => {
    try {
      const response = await axios.get(`${API}/clients`);
      setClients(response.data);
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      toast.error("Erro ao carregar clientes");
    }
  };

  const createClient = async () => {
    try {
      await axios.post(`${API}/clients`, newClient);
      toast.success("Cliente cadastrado com sucesso!");
      loadClients();
      setShowNewClientModal(false);
      setNewClient({
        company_name: "",
        business_area: "",
        company_size: "",
        location: "",
        contact_name: "",
        contact_role: "",
        contact_phone: "",
        contact_type: ""
      });
    } catch (error) {
      console.error("Erro ao criar cliente:", error);
      toast.error("Erro ao cadastrar cliente");
    }
  };

  const addContact = async () => {
    try {
      await axios.post(`${API}/clients/${selectedClient.id}/contacts`, {
        ...newContact,
        client_id: selectedClient.id
      });
      toast.success("Contato adicionado com sucesso!");
      
      // Recarrega o cliente selecionado
      const response = await axios.get(`${API}/clients/${selectedClient.id}`);
      setSelectedClient(response.data);
      
      setShowNewContactModal(false);
      setNewContact({
        name: "",
        role: "",
        phone: "",
        contact_type: ""
      });
    } catch (error) {
      console.error("Erro ao adicionar contato:", error);
      toast.error("Erro ao adicionar contato");
    }
  };

  const analyzeConversation = async (speechText) => {
    if (!selectedClient || !speechText.trim()) return;

    try {
      const response = await axios.post(`${API}/analyze-conversation`, {
        client_id: selectedClient.id,
        session_id: currentSessionId.current,
        speech_text: speechText
      });

      const aiResponse = response.data;
      
      // Adiciona mensagem do cliente
      const clientMessage = {
        id: Date.now(),
        type: "client_speech",
        content: speechText,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };
      
      // Adiciona sugestões da IA
      const aiMessage = {
        id: Date.now() + 1,
        type: "ai_suggestion",
        content: aiResponse.analysis,
        suggestions: aiResponse.suggestions,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };

      setConversationHistory(prev => [...prev, clientMessage, aiMessage]);
      setAiSuggestions(aiResponse.suggestions);
      setSentimentScore(aiResponse.sentiment_score);
      setCallFlowStatus(aiResponse.call_flow_status);
      
    } catch (error) {
      console.error("Erro na análise:", error);
      toast.error("Erro ao analisar conversa");
    }
  };

  // Reconhecimento de voz
  const initSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'pt-BR';
      
      recognitionRef.current.onstart = () => {
        setIsRecording(true);
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
        if (isCallActive) {
          setTimeout(() => {
            recognitionRef.current?.start();
          }, 100);
        }
      };
      
      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        const displayText = finalTranscript + (interimTranscript ? ` [${interimTranscript}]` : '');
        setTranscription(displayText || 'Aguardando fala...');
        
        if (finalTranscript.trim()) {
          analyzeConversation(finalTranscript.trim());
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Erro no reconhecimento:', event.error);
        toast.error(`Erro no reconhecimento: ${event.error}`);
      };
    } else {
      toast.error('Reconhecimento de voz não suportado neste navegador');
    }
  };

  const startCall = () => {
    if (!selectedClient) return;
    
    currentSessionId.current = Date.now().toString();
    setIsCallActive(true);
    setCallFlowStatus("Ligação ativa - Aguardando fala");
    setConversationHistory([]);
    toast.success("Ligação iniciada! Comece a falar...");
    
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
  };

  const endCall = () => {
    setIsCallActive(false);
    setIsRecording(false);
    setCallFlowStatus("Ligação encerrada");
    setTranscription("Transcrição em tempo real aparecerá aqui...");
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    toast.info("Ligação encerrada");
  };

  const getContactTypeColor = (type) => {
    switch(type) {
      case 'decisor': return 'bg-green-100 text-green-800 border-green-300';
      case 'influenciador': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'usuario': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 font-sans">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-800">🤖 IA de Vendas - Dos Anjos Engenharia</h1>
            <p className="text-slate-600 mt-1">Sistema Inteligente de Apoio a Vendas Técnicas</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          
          {/* Painel de Cliente - 3 colunas */}
          <div className="lg:col-span-3 space-y-6 overflow-y-auto">
            
            {/* Seleção de Cliente */}
            <Card data-testid="client-selector-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  👥 Seleção de Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="client-select">Cliente para Ligação:</Label>
                  <Select 
                    value={selectedClient?.id || ""} 
                    onValueChange={(value) => {
                      const client = clients.find(c => c.id === value);
                      setSelectedClient(client);
                      setCallFlowStatus(client ? "Cliente selecionado - Pronto para iniciar ligação" : "Selecione um cliente para iniciar");
                    }}
                  >
                    <SelectTrigger data-testid="client-select">
                      <SelectValue placeholder="Selecione um cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.company_name} ({client.business_area})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex gap-2">
                  <Dialog open={showNewClientModal} onOpenChange={setShowNewClientModal}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="new-client-btn">
                        ➕ Novo Cliente
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                  
                  <Dialog open={showNewContactModal} onOpenChange={setShowNewContactModal}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={!selectedClient}
                        data-testid="new-contact-btn"
                      >
                        👤 Novo Contato
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            {/* Informações do Cliente */}
            <Card data-testid="client-info-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  📋 Informações do Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedClient ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-slate-800">{selectedClient.company_name}</h3>
                      <p className="text-sm text-slate-600">{selectedClient.business_area} • {selectedClient.company_size}</p>
                      <p className="text-sm text-slate-600">{selectedClient.location}</p>
                    </div>
                    
                    {selectedClient.contacts && selectedClient.contacts.length > 0 && (
                      <div>
                        <h4 className="font-medium text-slate-700 mb-2">Contatos:</h4>
                        <div className="space-y-2">
                          {selectedClient.contacts.map(contact => (
                            <div key={contact.id} className="p-2 bg-slate-50 rounded-lg border-l-4 border-blue-400">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{contact.name}</p>
                                  <p className="text-xs text-slate-600">{contact.role}</p>
                                  <p className="text-xs text-slate-600">{contact.phone}</p>
                                </div>
                                <Badge className={getContactTypeColor(contact.contact_type)}>
                                  {contact.contact_type.toUpperCase()}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-600">Selecione um cliente para visualizar os detalhes</p>
                )}
              </CardContent>
            </Card>

            {/* Objetivo */}
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <h3 className="font-bold text-green-800 mb-2">🎯 OBJETIVO PRINCIPAL</h3>
                  <p className="text-green-700 font-semibold">MARCAR REUNIÃO DE APRESENTAÇÃO TÉCNICA</p>
                  <div className="mt-3 text-sm text-green-600 space-y-1">
                    <p>• Identificar necessidades técnicas</p>
                    <p>• Posicionar como especialista</p>
                    <p>• Agendar visita presencial</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Serviços */}
            <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-purple-800">🔧 Nossos Serviços</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-purple-700 space-y-1">
                  <p>⚡ Acompanhamento Técnico de Obras</p>
                  <p>⚡ Gerenciamento de Projetos</p>
                  <p>⚡ Projetos de Engenharia</p>
                  <p>⚡ Regularizações (AVCB, SPDA)</p>
                  <p>⚡ Laudos e Vistorias Técnicas</p>
                  <p>⚡ Levantamentos com Drone</p>
                  <p>⚡ Engenharia de Segurança</p>
                  <p>⚡ Consultoria Especializada</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Painel Central de Conversa - 6 colunas */}
          <div className="lg:col-span-6 space-y-4 overflow-y-auto">
            
            {/* Controles da Ligação */}
            <Card data-testid="call-controls-card">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isCallActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                    <span className="font-semibold">
                      {isCallActive ? 'Ligação Ativa' : 'Sistema Pronto'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={startCall}
                      disabled={!selectedClient || isCallActive}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="start-call-btn"
                    >
                      📞 Iniciar
                    </Button>
                    <Button 
                      onClick={endCall}
                      disabled={!isCallActive}
                      variant="destructive"
                      data-testid="end-call-btn"
                    >
                      ❌ Encerrar
                    </Button>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800" data-testid="flow-status">
                    📋 Fluxo: {callFlowStatus}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Controles de Áudio */}
            <Card className="bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Button
                    size="lg"
                    className={`w-16 h-16 rounded-full ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-cyan-500 hover:bg-cyan-600'}`}
                    disabled={!isCallActive}
                    data-testid="mic-button"
                  >
                    🎤
                  </Button>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">
                      Status: {isRecording ? 'Ouvindo...' : 'Pronto'}
                    </p>
                    {isRecording && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-red-600">Ouvindo:</span>
                        <div className="flex gap-1">
                          {[0,1,2,3].map(i => (
                            <div key={i} className={`w-1 h-4 bg-red-500 rounded animate-pulse`} style={{animationDelay: `${i * 0.1}s`}}></div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transcrição */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">🎙️ Transcrição em Tempo Real</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm min-h-[80px]" data-testid="transcription-box">
                  {transcription}
                </div>
              </CardContent>
            </Card>

            {/* Histórico da Conversa */}
            <Card className="flex-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">💬 Histórico da Conversa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto" data-testid="conversation-log">
                  {conversationHistory.length === 0 ? (
                    <div className="text-center p-8 text-slate-500">
                      <p>Inicie uma ligação para ver o histórico da conversa</p>
                    </div>
                  ) : (
                    conversationHistory.map((message) => (
                      <div 
                        key={message.id} 
                        className={`p-3 rounded-lg border-l-4 ${
                          message.type === 'client_speech' 
                            ? 'bg-red-50 border-red-400 text-red-800' 
                            : 'bg-green-50 border-green-400 text-green-800'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm">
                            {message.type === 'client_speech' ? '🗣️ Cliente' : '🤖 IA'}
                          </span>
                          <span className="text-xs opacity-75">{message.timestamp}</span>
                        </div>
                        <p className="text-sm">{message.content}</p>
                        {message.suggestions && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs font-medium">Sugestões:</p>
                            {message.suggestions.map((suggestion, idx) => (
                              <p key={idx} className="text-xs bg-white/50 p-1 rounded">• {suggestion}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Painel de Sugestões - 3 colunas */}
          <div className="lg:col-span-3 space-y-4 overflow-y-auto">
            
            {/* Métricas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">📊 Métricas da Ligação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4">
                  <div className="text-center p-3 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-700" data-testid="sentiment-score">{sentimentScore}%</div>
                    <div className="text-xs text-green-600">Interesse</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sugestões da IA */}
            <Card className="flex-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">🎯 Sugestões IA</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3" data-testid="suggestions-container">
                  {aiSuggestions.length === 0 ? (
                    <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                      <h4 className="font-semibold text-orange-800 text-sm mb-2">💡 Dica Inicial</h4>
                      <p className="text-orange-700 text-sm">
                        Selecione um cliente e inicie a ligação para receber sugestões inteligentes em tempo real
                      </p>
                    </div>
                  ) : (
                    aiSuggestions.map((suggestion, index) => (
                      <div key={index} className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 cursor-pointer hover:shadow-md transition-shadow">
                        <h4 className="font-semibold text-blue-800 text-sm mb-1">💭 Sugestão {index + 1}</h4>
                        <p className="text-blue-700 text-sm">{suggestion}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal Novo Cliente */}
      <Dialog open={showNewClientModal} onOpenChange={setShowNewClientModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>➕ Cadastrar Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input
                placeholder="Ex: Metalúrgica XYZ Ltda"
                value={newClient.company_name}
                onChange={(e) => setNewClient({...newClient, company_name: e.target.value})}
                data-testid="company-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Área de Atuação</Label>
              <Select value={newClient.business_area} onValueChange={(value) => setNewClient({...newClient, business_area: value})}>
                <SelectTrigger data-testid="business-area-select">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="construcao">Construção Civil</SelectItem>
                  <SelectItem value="comercio">Comércio</SelectItem>
                  <SelectItem value="servicos">Serviços</SelectItem>
                  <SelectItem value="hospitalar">Hospitalar</SelectItem>
                  <SelectItem value="educacional">Educacional</SelectItem>
                  <SelectItem value="residencial">Residencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Porte da Empresa</Label>
              <Select value={newClient.company_size} onValueChange={(value) => setNewClient({...newClient, company_size: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="micro">Micro (até 9 funcionários)</SelectItem>
                  <SelectItem value="pequena">Pequena (10-49 funcionários)</SelectItem>
                  <SelectItem value="media">Média (50-499 funcionários)</SelectItem>
                  <SelectItem value="grande">Grande (500+ funcionários)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cidade/Estado</Label>
              <Input
                placeholder="Ex: São Paulo - SP"
                value={newClient.location}
                onChange={(e) => setNewClient({...newClient, location: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do Contato</Label>
              <Input
                placeholder="Nome da pessoa"
                value={newClient.contact_name}
                onChange={(e) => setNewClient({...newClient, contact_name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Função do Contato</Label>
              <Input
                placeholder="Ex: Gerente de Operações"
                value={newClient.contact_role}
                onChange={(e) => setNewClient({...newClient, contact_role: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={newClient.contact_phone}
                onChange={(e) => setNewClient({...newClient, contact_phone: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Contato</Label>
              <Select value={newClient.contact_type} onValueChange={(value) => setNewClient({...newClient, contact_type: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decisor">Decisor</SelectItem>
                  <SelectItem value="influenciador">Influenciador</SelectItem>
                  <SelectItem value="usuario">Usuário/Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowNewClientModal(false)}>
              Cancelar
            </Button>
            <Button onClick={createClient} className="bg-green-600 hover:bg-green-700" data-testid="save-client-btn">
              💾 Salvar Cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Novo Contato */}
      <Dialog open={showNewContactModal} onOpenChange={setShowNewContactModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>👤 Adicionar Novo Contato</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="bg-slate-50 p-3 rounded-lg mb-4">
              <p className="font-semibold text-slate-800">{selectedClient.company_name}</p>
              <p className="text-sm text-slate-600">{selectedClient.business_area}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Contato</Label>
              <Input
                placeholder="Nome da pessoa"
                value={newContact.name}
                onChange={(e) => setNewContact({...newContact, name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Input
                placeholder="Ex: Diretor Técnico"
                value={newContact.role}
                onChange={(e) => setNewContact({...newContact, role: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                placeholder="(11) 99999-9999"
                value={newContact.phone}
                onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Contato</Label>
              <Select value={newContact.contact_type} onValueChange={(value) => setNewContact({...newContact, contact_type: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="decisor">Decisor</SelectItem>
                  <SelectItem value="influenciador">Influenciador</SelectItem>
                  <SelectItem value="usuario">Usuário/Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowNewContactModal(false)}>
              Cancelar
            </Button>
            <Button onClick={addContact} className="bg-green-600 hover:bg-green-700" data-testid="save-contact-btn">
              💾 Adicionar Contato
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;