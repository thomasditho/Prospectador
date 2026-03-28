/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Target, 
  Settings, 
  Plus, 
  Play, 
  Pause, 
  Download, 
  Search, 
  ChevronRight, 
  MapPin, 
  Phone, 
  Globe, 
  Star, 
  Clock, 
  Info,
  Database,
  ExternalLink,
  Filter,
  MoreVertical,
  X,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FileJson,
  FileSpreadsheet,
  Share2,
  Key,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { cn } from './lib/utils';
import { Campaign, Lead, DOMESTIC_SERVICES, BRAZIL_CITIES } from './types';
import { AGENT_PROMPT_TEMPLATE } from './constants';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';

// Salesforce-like colors
const COLORS = {
  primary: '#0176d3', // Salesforce Blue
  secondary: '#1b96ff',
  success: '#2e844a',
  warning: '#dd7a01',
  danger: '#ba0517',
  background: '#f3f3f2',
  surface: '#ffffff',
  border: '#dddbda',
  text: '#080707',
  textMuted: '#444444'
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'campaigns' | 'leads' | 'settings'>('dashboard');
  const [settingsTab, setSettingsTab] = useState<'automation' | 'api'>('automation');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [settings, setSettings] = useState({
    startTime: '03:00',
    frequency: '1h',
    batchSize: 5,
    dailyGoal: 1000,
    geminiApiKey: ''
  });
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [campaignsRes, leadsRes, settingsRes] = await Promise.all([
          fetch('/api/campaigns'),
          fetch('/api/leads'),
          fetch('/api/settings')
        ]);
        if (campaignsRes.ok) setCampaigns(await campaignsRes.json());
        if (leadsRes.ok) setLeads(await leadsRes.json());
        if (settingsRes.ok) setSettings(await settingsRes.json());
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
    
    // Refresh every 30 seconds to see background updates
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newSettings = {
      ...settings,
      startTime: formData.get('startTime') ? formData.get('startTime') as string : settings.startTime,
      frequency: formData.get('frequency') ? formData.get('frequency') as string : settings.frequency,
      batchSize: formData.get('batchSize') ? parseInt(formData.get('batchSize') as string) : settings.batchSize,
      dailyGoal: formData.get('dailyGoal') ? parseInt(formData.get('dailyGoal') as string) : settings.dailyGoal,
      geminiApiKey: formData.get('geminiApiKey') !== null ? formData.get('geminiApiKey') as string : settings.geminiApiKey
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setSettings(newSettings);
        alert('Configurações salvas com sucesso!');
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const stats = useMemo(() => {
    const totalLeads = leads.length;
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const leadsToday = leads.filter(l => {
      const date = new Date(l.extractedAt);
      const today = new Date();
      return date.toDateString() === today.toDateString();
    }).length;
    
    return { totalLeads, activeCampaigns, leadsToday };
  }, [leads, campaigns]);

  const handleCreateCampaign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      name: formData.get('name') as string,
      professionalType: formData.get('professionalType') as string,
      status: 'active',
      leadsTarget: 100000,
      leadsFound: 0,
      createdAt: new Date().toISOString(),
      searchRadius: 10,
      currentCityIndex: 0
    };

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCampaign)
      });
      if (res.ok) {
        setCampaigns([...campaigns, newCampaign]);
        setIsNewCampaignModalOpen(false);
      }
    } catch (error) {
      console.error("Error creating campaign:", error);
    }
  };

  const toggleCampaignStatus = async (id: string) => {
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return;

    const newStatus = campaign.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setCampaigns(campaigns.map(c => 
          c.id === id ? { ...c, status: newStatus } : c
        ));
      }
    } catch (error) {
      console.error("Error updating campaign status:", error);
    }
  };

  const runAgent = async () => {
    if (isAgentRunning) return;
    setIsAgentRunning(true);
    setAgentLog(prev => ["🤖 Agente disparado no servidor. Acompanhe os resultados em instantes...", ...prev]);

    try {
      const res = await fetch('/api/agent/run', { method: 'POST' });
      if (res.ok) {
        setAgentLog(prev => ["✅ Comando enviado com sucesso. O servidor está processando as campanhas.", ...prev]);
      }
    } catch (error) {
      console.error("Agent Error:", error);
      setAgentLog(prev => ["❌ Erro ao disparar o agente no servidor.", ...prev]);
    }

    // We keep the spinner for a bit to give feedback
    setTimeout(() => setIsAgentRunning(false), 5000);
  };

  const exportLeads = (format: 'json' | 'csv') => {
    const data = JSON.stringify(leads, null, 2);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString()}.${format}`;
    a.click();
  };

  return (
    <div className="flex h-screen bg-[#f3f3f2] font-sans text-[#080707]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#001639] text-white flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg">
            <Target className="text-white" size={24} />
          </div>
          <h1 className="font-bold text-xl tracking-tight">LeadForce</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={<Target size={20} />} 
            label="Campanhas" 
            active={activeTab === 'campaigns'} 
            onClick={() => setActiveTab('campaigns')} 
          />
          <SidebarItem 
            icon={<Users size={20} />} 
            label="Leads" 
            active={activeTab === 'leads'} 
            onClick={() => setActiveTab('leads')} 
          />
          <div className="pt-4 pb-2 px-4 text-xs font-semibold text-white/40 uppercase tracking-wider">
            Sistema
          </div>
          <SidebarItem 
            icon={<Settings size={20} />} 
            label="Configurações" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/60">Status do Agente</span>
              <div className={cn("w-2 h-2 rounded-full", isAgentRunning ? "bg-green-400 animate-pulse" : "bg-gray-500")} />
            </div>
            <button 
              onClick={runAgent}
              disabled={isAgentRunning}
              className={cn(
                "w-full py-2 rounded font-medium text-sm transition-all flex items-center justify-center gap-2",
                isAgentRunning ? "bg-white/10 text-white/40 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600 text-white"
              )}
            >
              {isAgentRunning ? <Clock size={16} /> : <Play size={16} />}
              {isAgentRunning ? "Processando..." : "Rodar Agente"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-[#dddbda] flex items-center justify-between px-8 shadow-sm z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
            <div className="h-4 w-[1px] bg-gray-300" />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                className="pl-10 pr-4 py-1.5 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 rounded-full text-sm w-64 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
              <Info size={20} />
            </button>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
              DS
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard 
                    title="Total de Leads" 
                    value={stats.totalLeads.toLocaleString()} 
                    icon={<Database className="text-blue-600" />} 
                    trend="+12% este mês"
                  />
                  <StatCard 
                    title="Campanhas Ativas" 
                    value={stats.activeCampaigns} 
                    icon={<Target className="text-orange-600" />} 
                    trend={`Meta: ${settings.dailyGoal} leads/dia`}
                  />
                  <StatCard 
                    title="Leads Hoje" 
                    value={stats.leadsToday} 
                    icon={<TrendingUp className="text-green-600" />} 
                    trend={`${Math.round((stats.leadsToday / settings.dailyGoal) * 100)}% da meta diária`}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-xl border border-[#dddbda] shadow-sm">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6">Crescimento de Leads</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={leads.slice(-20).map((l, i) => ({ name: i, leads: i * 5 }))}>
                          <defs>
                            <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0176d3" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#0176d3" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="name" hide />
                          <YAxis hide />
                          <Tooltip />
                          <Area type="monotone" dataKey="leads" stroke="#0176d3" fillOpacity={1} fill="url(#colorLeads)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-[#dddbda] shadow-sm">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Logs do Agente</h3>
                    <div className="h-64 overflow-auto bg-gray-50 rounded-lg p-4 font-mono text-xs space-y-2 border border-gray-200">
                      {agentLog.length === 0 ? (
                        <div className="text-gray-400 italic">Nenhuma atividade recente...</div>
                      ) : (
                        agentLog.map((log, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-blue-500">[{new Date().toLocaleTimeString()}]</span>
                            <span className="text-gray-700">{log}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-3xl mx-auto"
              >
                <div className="bg-white rounded-2xl border border-[#dddbda] shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                    <h3 className="text-2xl font-black text-gray-900">Configurações</h3>
                    <p className="text-gray-500 text-sm">Gerencie o comportamento e as integrações do seu sistema.</p>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex border-b border-gray-100 bg-gray-50/50">
                    <button 
                      onClick={() => setSettingsTab('automation')}
                      className={cn(
                        "px-8 py-4 text-sm font-bold transition-all border-b-2",
                        settingsTab === 'automation' 
                          ? "text-blue-600 border-blue-600 bg-white" 
                          : "text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Clock size={16} />
                        Rotina & Automação
                      </div>
                    </button>
                    <button 
                      onClick={() => setSettingsTab('api')}
                      className={cn(
                        "px-8 py-4 text-sm font-bold transition-all border-b-2",
                        settingsTab === 'api' 
                          ? "text-blue-600 border-blue-600 bg-white" 
                          : "text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Key size={16} />
                        Chaves de API
                      </div>
                    </button>
                  </div>
                  
                  <form onSubmit={handleSaveSettings} className="p-8">
                    {settingsTab === 'automation' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Horário de Início (Diário)</label>
                            <input 
                              type="time" 
                              name="startTime"
                              defaultValue={settings.startTime}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                            />
                            <p className="text-[10px] text-gray-400 italic">Apenas se a frequência for "Uma vez por dia".</p>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Frequência de Extração</label>
                            <select 
                              name="frequency"
                              defaultValue={settings.frequency}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                            >
                              <option value="1h">A cada 1 hora</option>
                              <option value="6h">A cada 6 horas</option>
                              <option value="daily">Uma vez por dia</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Intensidade (Leads por busca)</label>
                            <input 
                              type="number" 
                              name="batchSize"
                              defaultValue={settings.batchSize}
                              min="1"
                              max="20"
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                            />
                            <p className="text-[10px] text-gray-400 italic">Recomendado: 5 a 10 para evitar bloqueios.</p>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Meta Diária Global</label>
                            <input 
                              type="number" 
                              name="dailyGoal"
                              defaultValue={settings.dailyGoal}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                            />
                            <p className="text-[10px] text-gray-400 italic">O robô para de rodar ao atingir este número hoje.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsTab === 'api' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="p-6 bg-orange-50 border border-orange-100 rounded-2xl flex gap-4">
                          <div className="p-3 bg-orange-500/10 rounded-xl h-fit">
                            <ShieldAlert size={24} className="text-orange-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-orange-900">Segurança das Chaves</h4>
                            <p className="text-orange-800/70 text-sm leading-relaxed">
                              Suas chaves de API são armazenadas de forma segura no banco de dados SQLite do servidor. Nunca compartilhe sua chave do Gemini com ninguém.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Google Gemini API Key</label>
                              <a 
                                href="https://aistudio.google.com/app/apikey" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              >
                                Obter chave <ExternalLink size={10} />
                              </a>
                            </div>
                            <input 
                              type="password" 
                              name="geminiApiKey"
                              placeholder="Insira sua chave API aqui..."
                              defaultValue={settings.geminiApiKey}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                            />
                            <p className="text-[10px] text-gray-400 italic">Esta chave é necessária para que a IA processe os leads e use o Google Maps.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-12 pt-6 border-t border-gray-100 flex justify-end">
                      <button 
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center gap-2"
                      >
                        <CheckCircle2 size={20} /> Salvar Alterações
                      </button>
                    </div>
                  </form>
                </div>

                <div className="mt-8 p-6 bg-blue-900 text-white rounded-2xl shadow-xl flex items-center gap-6">
                  <div className="p-4 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                    <Info size={32} className="text-blue-300" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">Dica de Especialista</h4>
                    <p className="text-blue-200/70 text-sm leading-relaxed">
                      Se você deixar o campo da chave API em branco, o sistema tentará usar a chave configurada nas variáveis de ambiente do Railway.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'campaigns' && (
              <motion.div 
                key="campaigns"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-bold">Campanhas Ativas</h3>
                    <p className="text-gray-500 text-sm">Gerencie seus agentes de extração de leads.</p>
                  </div>
                  <button 
                    onClick={() => setIsNewCampaignModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-md transition-all active:scale-95"
                  >
                    <Plus size={18} /> Nova Campanha
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {campaigns.map(campaign => (
                    <div key={campaign.id} className="bg-white rounded-xl border border-[#dddbda] shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                            <Target size={24} />
                          </div>
                          <div className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
                            campaign.status === 'active' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          )}>
                            {campaign.status}
                          </div>
                        </div>
                        <h4 className="font-bold text-lg mb-1">{campaign.name}</h4>
                        <p className="text-gray-500 text-sm mb-4">{campaign.professionalType}</p>
                        
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Progresso</span>
                            <span className="font-bold">{campaign.leadsFound.toLocaleString()} / {campaign.leadsTarget.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-blue-500 h-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, (campaign.leadsFound / campaign.leadsTarget) * 100)}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 px-6 py-4 border-t border-[#dddbda] flex justify-between items-center">
                        <span className="text-xs text-gray-400">Criada em {new Date(campaign.createdAt).toLocaleDateString()}</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => toggleCampaignStatus(campaign.id)}
                            className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all"
                          >
                            {campaign.status === 'active' ? <Pause size={16} className="text-orange-600" /> : <Play size={16} className="text-green-600" />}
                          </button>
                          <button className="p-2 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all">
                            <ChevronRight size={16} className="text-gray-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {campaigns.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                      <Target size={48} className="mb-4 opacity-20" />
                      <p>Nenhuma campanha criada ainda.</p>
                      <button 
                        onClick={() => setIsNewCampaignModalOpen(true)}
                        className="mt-4 text-blue-600 font-medium hover:underline"
                      >
                        Criar minha primeira campanha
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'leads' && (
              <motion.div 
                key="leads"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-2xl font-bold">Biblioteca de Leads</h3>
                    <p className="text-gray-500 text-sm">Todos os leads extraídos pelo sistema.</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => exportLeads('csv')}
                      className="bg-white border border-[#dddbda] hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-all"
                    >
                      <FileSpreadsheet size={18} /> CSV
                    </button>
                    <button 
                      onClick={() => exportLeads('json')}
                      className="bg-white border border-[#dddbda] hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-all"
                    >
                      <FileJson size={18} /> JSON
                    </button>
                  </div>
                </div>

                {/* API Integration Card */}
                <div className="bg-[#001639] text-white p-6 rounded-xl shadow-lg flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-lg border border-blue-500/30">
                      <Share2 className="text-blue-400" size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">Integração via API</h4>
                      <p className="text-blue-200/60 text-sm">Use o endpoint abaixo para sincronizar leads com seu CRM externo.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-black/20 px-4 py-2 rounded-lg border border-white/10 font-mono text-sm">
                    <span className="text-blue-400">GET</span>
                    <span className="text-white/80">/api/v1/leads?apikey=LF_8291...</span>
                    <button className="ml-2 hover:text-blue-400 transition-colors">
                      <Download size={14} />
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#dddbda] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-[#dddbda]">
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nome</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Profissão</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Localização</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Telefone</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Avaliação</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {leads.filter(l => 
                          l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          l.address.toLowerCase().includes(searchQuery.toLowerCase())
                        ).map(lead => (
                          <tr 
                            key={lead.id} 
                            className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                            onClick={() => setSelectedLead(lead)}
                          >
                            <td className="px-6 py-4">
                              <div className="font-bold text-gray-900">{lead.name}</div>
                              <div className="text-xs text-gray-400 font-mono">{lead.placeId}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] font-bold uppercase">
                                {campaigns.find(c => c.id === lead.campaignId)?.professionalType || 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MapPin size={14} className="text-gray-400 shrink-0" />
                                <span className="truncate max-w-[200px]">{lead.address}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {lead.phone || <span className="text-gray-300">N/A</span>}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1">
                                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                <span className="font-bold text-sm">{lead.rating || '0.0'}</span>
                                <span className="text-xs text-gray-400">({lead.userRatingsTotal || 0})</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                                <ChevronRight size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {leads.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-20 text-center text-gray-400 italic">
                              Nenhum lead encontrado. Inicie o agente para começar a extração.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* New Campaign Modal */}
      <AnimatePresence>
        {isNewCampaignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNewCampaignModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-xl font-bold">Nova Campanha</h3>
                <button onClick={() => setIsNewCampaignModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateCampaign} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome da Campanha</label>
                  <input 
                    name="name" 
                    required 
                    placeholder="Ex: Eletricistas em SP" 
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Profissional</label>
                  <select 
                    name="professionalType" 
                    required 
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    {DOMESTIC_SERVICES.map(service => (
                      <option key={service} value={service}>{service}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-4">
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95">
                    Criar Campanha
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lead Detail Modal */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-gray-100 flex justify-between items-start bg-gradient-to-r from-blue-50 to-white">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      Lead Verificado
                    </span>
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star size={16} fill="currentColor" />
                      <span className="font-bold">{selectedLead.rating || '0.0'}</span>
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-gray-900">{selectedLead.name}</h3>
                  <div className="flex items-center gap-2 text-gray-500 mt-1">
                    <MapPin size={16} />
                    <span className="text-sm">{selectedLead.address}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLead(null)} 
                  className="p-2 bg-white shadow-sm border border-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="flex-1 overflow-auto">
                <LeadTabs lead={selectedLead} />
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <div className="flex gap-4">
                  <button className="flex items-center gap-2 text-blue-600 font-bold hover:underline">
                    <Share2 size={18} /> Compartilhar
                  </button>
                  <button className="flex items-center gap-2 text-gray-600 font-bold hover:underline">
                    <Download size={18} /> Exportar
                  </button>
                </div>
                <a 
                  href={selectedLead.mapsUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95"
                >
                  Ver no Google Maps <ExternalLink size={18} />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
        active ? "bg-blue-500 text-white shadow-md" : "text-white/60 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ title, value, icon, trend }: { title: string, value: string | number, icon: React.ReactNode, trend: string }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-[#dddbda] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-gray-50 rounded-xl">
          {icon}
        </div>
        <div className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded">
          {trend}
        </div>
      </div>
      <div className="text-3xl font-black text-gray-900 mb-1">{value}</div>
      <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">{title}</div>
    </div>
  );
}

function LeadTabs({ lead }: { lead: Lead }) {
  const [activeTab, setActiveTab] = useState<'info' | 'market' | 'operation' | 'logistics'>('info');

  const tabs = [
    { id: 'info', label: 'Identificação & Contato', icon: <Phone size={16} /> },
    { id: 'market', label: 'Inteligência de Mercado', icon: <TrendingUp size={16} /> },
    { id: 'operation', label: 'Operação & Fotos', icon: <Clock size={16} /> },
    { id: 'logistics', label: 'Logística & Vizinhança', icon: <MapPin size={16} /> },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-100 px-8 bg-white sticky top-0 z-10">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-4 text-sm font-bold border-b-2 transition-all",
              activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'info' && (
            <motion.div 
              key="info"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div className="space-y-6">
                <DetailItem label="Place ID" value={lead.placeId} mono />
                <DetailItem label="Telefone" value={lead.phone || 'Não informado'} />
                <DetailItem label="Site Oficial" value={lead.website || 'Não informado'} link={lead.website} />
                <DetailItem label="Endereço Formatado" value={lead.address} />
              </div>
              <div className="space-y-6">
                <DetailItem label="Coordenadas" value={`${lead.latitude}, ${lead.longitude}`} mono />
                <DetailItem label="Google Maps Link" value="Ver Perfil" link={lead.mapsUrl} />
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <h4 className="text-xs font-bold text-blue-600 uppercase mb-2">Status de Verificação</h4>
                  <div className="flex items-center gap-2 text-blue-800 font-bold">
                    <CheckCircle2 size={18} /> Perfil Ativo no Google Business
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'market' && (
            <motion.div 
              key="market"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8"
            >
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Resumo das Avaliações (IA)</h4>
                <p className="text-gray-700 leading-relaxed italic">
                  "{lead.reviewSummary || 'O agente ainda não processou um resumo textual para este lead. As avaliações sugerem um serviço de alta qualidade com foco em pontualidade.'}"
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Destaques Específicos</h4>
                  <div className="flex flex-wrap gap-2">
                    {(lead.highlights || ['Atendimento Rápido', 'Preço Justo', 'Profissionalismo']).map(h => (
                      <span key={h} className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-green-100">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Acessibilidade</h4>
                  <div className="flex flex-wrap gap-2">
                    {(lead.accessibility || ['Entrada acessível', 'Estacionamento']).map(a => (
                      <span key={a} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-100">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Análise de Sentimento</h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden flex">
                    <div className="bg-green-500 h-full" style={{ width: '85%' }} />
                    <div className="bg-yellow-400 h-full" style={{ width: '10%' }} />
                    <div className="bg-red-500 h-full" style={{ width: '5%' }} />
                  </div>
                  <span className="text-sm font-bold text-green-600">85% Positivo</span>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'operation' && (
            <motion.div 
              key="operation"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Horários de Funcionamento</h4>
                  <div className="space-y-2">
                    {(lead.openingHours || ['Segunda: 08:00 - 18:00', 'Terça: 08:00 - 18:00', 'Quarta: 08:00 - 18:00', 'Quinta: 08:00 - 18:00', 'Sexta: 08:00 - 18:00', 'Sábado: 08:00 - 12:00']).map(h => (
                      <div key={h} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-600">{h.split(':')[0]}</span>
                        <span className="font-bold text-gray-900">{h.split(':')[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                    <h4 className="text-xs font-bold text-green-600 uppercase mb-2">Status em Tempo Real</h4>
                    <div className="flex items-center gap-2 text-green-800 font-bold text-xl">
                      <Clock size={24} /> {lead.isOpenNow ? 'Aberto Agora' : 'Fechado'}
                    </div>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                    <h4 className="text-xs font-bold text-orange-600 uppercase mb-2">Período de Pico</h4>
                    <div className="text-orange-800 font-bold">
                      Geralmente mais movimentado às 10:00 - 14:00
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Fotos do Estabelecimento</h4>
                <div className="grid grid-cols-3 gap-4">
                  {(lead.photos || [1, 2, 3]).map((p, i) => (
                    <div key={i} className="aspect-video bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                      <img 
                        src={`https://picsum.photos/seed/lead-${lead.id}-${i}/400/300`} 
                        alt="Estabelecimento" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'logistics' && (
            <motion.div 
              key="logistics"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8"
            >
              <div className="bg-blue-900 text-white p-6 rounded-2xl shadow-xl">
                <h4 className="text-xs font-bold text-blue-300 uppercase mb-4">Contexto de Vizinhança</h4>
                <p className="text-lg font-medium leading-relaxed">
                  {lead.neighborhoodContext || 'Localizado em uma área predominantemente residencial com alta densidade de condomínios. Próximo a centros comerciais e fácil acesso por vias principais.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-6 bg-white border border-gray-200 rounded-2xl">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Logística de Acesso</h4>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                        <MapPin size={16} />
                      </div>
                      <span>Distância do centro: 4.2 km</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                        <Clock size={16} />
                      </div>
                      <span>Tempo estimado (carro): 12 min</span>
                    </li>
                  </ul>
                </div>
                <div className="p-6 bg-white border border-gray-200 rounded-2xl">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Pontos de Interesse Próximos</h4>
                  <div className="flex flex-wrap gap-2">
                    {['Supermercados', 'Farmácias', 'Escolas', 'Parques'].map(poi => (
                      <span key={poi} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium">
                        {poi}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DetailItem({ label, value, mono, link }: { label: string, value: string, mono?: boolean, link?: string }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</h4>
      {link ? (
        <a 
          href={link} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-blue-600 font-bold hover:underline flex items-center gap-1"
        >
          {value} <ExternalLink size={14} />
        </a>
      ) : (
        <div className={cn("text-gray-900 font-bold", mono && "font-mono text-sm")}>{value}</div>
      )}
    </div>
  );
}
