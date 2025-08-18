import axios from 'axios';

// API client configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth tokens (when we implement auth)
api.interceptors.request.use(
  (config) => {
    // TODO: Add auth token when Cognito is implemented
    // const token = localStorage.getItem('authToken');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// Type definitions
export interface Article {
  id: string;
  title: string;
  summary: string;
  content?: string;
  source_url: string;
  newsletter_source: string;
  published_date: string;
  created_at: string;
}

export interface ChatMessage {
  message: string;
  sources?: Article[];
}

export interface ChatResponse {
  response: string;
  sources?: Article[];
}

// API functions
export const apiClient = {
  // Health check
  health: () => api.get('/health'),

  // Articles
  getArticles: (limit?: number, offset?: number) => 
    api.get<Article[]>('/articles', { params: { limit, offset } }),

  searchArticles: (query: string) => 
    api.get<Article[]>('/articles/search', { params: { q: query } }),

  // Chat
  sendChatMessage: (message: string) => 
    api.post<ChatResponse>('/chat', { message }),

  // Newsletter processing (admin)
  processNewsletter: (newsletterData: any) => 
    api.post('/admin/process-newsletter', newsletterData),
};

export default api;