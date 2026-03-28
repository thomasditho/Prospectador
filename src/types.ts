export interface Lead {
  id: string;
  campaignId: string;
  name: string;
  placeId: string;
  mapsUrl: string;
  phone?: string;
  website?: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingsTotal?: number;
  reviewSummary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  highlights?: string[];
  accessibility?: string[];
  openingHours?: string[];
  isOpenNow?: boolean;
  photos?: string[];
  neighborhoodContext?: string;
  extractedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  professionalType: string;
  status: 'active' | 'paused' | 'completed';
  leadsTarget: number;
  leadsFound: number;
  createdAt: string;
  lastRunAt?: string;
  searchRadius: number; // in km
  currentCityIndex: number;
}

export const DOMESTIC_SERVICES = [
  "Marido de Aluguel",
  "Eletricista",
  "Encanador",
  "Pintor",
  "Pedreiro",
  "Marceneiro",
  "Faxineira",
  "Jardineiro",
  "Técnico de Ar Condicionado",
  "Chaveiro",
  "Montador de Móveis",
  "Gesseiro",
  "Vidraceiro",
  "Dedetizador",
  "Limpeza de Estofados",
  "Técnico de Máquina de Lavar",
  "Técnico de Geladeira",
  "Desentupidora",
  "Instalador de Redes de Proteção",
  "Serralheiro",
  "Instalador de Papel de Parede",
  "Técnico de Fogão",
  "Instalador de Antena",
  "Técnico de Portão Eletrônico",
  "Instalador de Câmeras (CFTV)",
  "Técnico de Piscina",
  "Impermeabilizador",
  "Lustrador de Móveis",
  "Restaurador de Piso",
  "Telhadista"
];

export const BRAZIL_CITIES = [
  "São Paulo, SP", "Rio de Janeiro, RJ", "Brasília, DF", "Salvador, BA", "Fortaleza, CE",
  "Belo Horizonte, MG", "Manaus, AM", "Curitiba, PR", "Recife, PE", "Goiânia, GO",
  "Belém, PA", "Porto Alegre, RS", "Guarulhos, SP", "Campinas, SP", "São Luís, MA",
  "São Gonçalo, RJ", "Maceió, AL", "Duque de Caxias, RJ", "Natal, RN", "Teresina, PI",
  "São Bernardo do Campo, SP", "Nova Iguaçu, RJ", "Campo Grande, MS", "João Pessoa, PB",
  "Santo André, SP", "São José dos Campos, SP", "Jaboatão dos Guararapes, PE", "Osasco, SP",
  "Ribeirão Preto, SP", "Uberlândia, MG", "Sorocaba, SP", "Aracaju, SE", "Cuiabá, MT",
  "Joinville, SC", "Aparecida de Goiânia, GO", "Londrina, PR", "Ananindeua, PA", "Porto Velho, RO",
  "Niterói, RJ", "Belford Roxo, RJ", "Serra, ES", "Caxias do Sul, RS", "Campos dos Goytacazes, RJ",
  "Macapá, AP", "Florianópolis, SC", "Vila Velha, ES", "Mauá, SP", "São João de Meriti, RJ",
  "São José do Rio Preto, SP", "Mogi das Cruzes, SP"
];
