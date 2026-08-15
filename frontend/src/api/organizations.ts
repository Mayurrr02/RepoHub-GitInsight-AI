import { api } from './client';

export type Organization = {
  id: number;
  name: string;
  slug: string;
  avatar_url: string | null;
  owner_id: number;
  created_at: string;
  my_role: string | null;
  members_count: number;
  repositories_count: number;
};

export type OrganizationMember = {
  id: number;
  organization_id: number;
  user_id: number;
  role: string;
  joined_at: string;
  user: {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };
};

export type OrganizationRepository = {
  id: number;
  organization_id: number;
  repository_id: number;
  added_at: string;
  repository: {
    id: number;
    github_id: number;
    name: string;
    full_name: string;
    html_url: string;
    description: string | null;
    is_private: boolean;
    language: string | null;
    stars: number;
    updated_at: string | null;
  };
};

export type AuditLog = {
  id: number;
  user_id: number | null;
  user_login: string | null;
  organization_id: number | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
};

export async function listOrganizations(): Promise<Organization[]> {
  const { data } = await api.get('/organizations');
  return data;
}

export async function getOrganization(id: number): Promise<Organization> {
  const { data } = await api.get(`/organizations/${id}`);
  return data;
}

export async function createOrganization(payload: { name: string; slug: string; avatar_url?: string }): Promise<Organization> {
  const { data } = await api.post('/organizations', payload);
  return data;
}

export async function updateOrganization(id: number, payload: { name?: string; avatar_url?: string }): Promise<Organization> {
  const { data } = await api.put(`/organizations/${id}`, payload);
  return data;
}

export async function deleteOrganization(id: number): Promise<void> {
  await api.delete(`/organizations/${id}`);
}

export async function listMembers(orgId: number): Promise<OrganizationMember[]> {
  const { data } = await api.get(`/organizations/${orgId}/members`);
  return data;
}

export async function addMember(orgId: number, payload: { login?: string; user_id?: number; role: string }): Promise<OrganizationMember> {
  const { data } = await api.post(`/organizations/${orgId}/members`, payload);
  return data;
}

export async function updateMemberRole(orgId: number, userId: number, role: string): Promise<OrganizationMember> {
  const { data } = await api.put(`/organizations/${orgId}/members/${userId}`, { role });
  return data;
}

export async function removeMember(orgId: number, userId: number): Promise<void> {
  await api.delete(`/organizations/${orgId}/members/${userId}`);
}

export async function listOrgRepositories(orgId: number): Promise<OrganizationRepository[]> {
  const { data } = await api.get(`/organizations/${orgId}/repositories`);
  return data;
}

export async function linkRepository(orgId: number, repoId: number): Promise<OrganizationRepository> {
  const { data } = await api.post(`/organizations/${orgId}/repositories/${repoId}`);
  return data;
}

export async function unlinkRepository(orgId: number, repoId: number): Promise<void> {
  await api.delete(`/organizations/${orgId}/repositories/${repoId}`);
}

export async function getAuditLogs(orgId: number, action?: string): Promise<{ total: number; logs: AuditLog[] }> {
  const params = action ? { action } : {};
  const { data } = await api.get(`/organizations/${orgId}/audit-logs`, { params });
  return data;
}
