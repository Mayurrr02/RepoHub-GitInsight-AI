import { api } from './client';
export const chat = (question: string) => api.post<{answer:string}>('/ai/chat', {question}).then(r => r.data);
export const downloadReport = () => api.post('/ai/report', {}, {responseType:'blob'}).then(r => r.data);
