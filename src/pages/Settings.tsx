import React, { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageLayout } from '@/components/PageLayout';
import { api } from '@/lib/api-client';
import type { User, EPRReport, ConfigUserUpdate } from '@shared/types';
import { useAuthStore } from '@/stores/useAuthStore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldAlert, Download, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
const COLORS = ['#38761d', '#5a9a47', '#7cb870', '#a0d69a', '#c5f4c3', '#e7f9e6'];
function UserRolesTable() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ['config-users'],
    queryFn: () => api<Omit<User, 'password_hash'>[]>('/api/config/users'),
  });
  const [userChanges, setUserChanges] = useState<Map<string, ConfigUserUpdate>>(new Map());
  const mutation = useMutation({
    mutationFn: (updates: ConfigUserUpdate[]) => api('/api/config/users', {
      method: 'POST',
      body: JSON.stringify(updates),
    }),
    onSuccess: () => {
      toast.success('User configurations saved successfully!');
      setUserChanges(new Map());
      queryClient.invalidateQueries({ queryKey: ['config-users'] });
    },
    onError: (error) => {
      toast.error('Failed to save changes', { description: error.message });
    },
  });
  const handleFieldChange = (userId: string, field: keyof ConfigUserUpdate, value: any) => {
    const user = users?.find(u => u.id === userId);
    if (!user) return;
    setUserChanges(prev => {
      const newChanges = new Map(prev);
      const currentUserChanges = newChanges.get(userId) || { 
        id: userId, 
        role: user.role, 
        active: user.active, 
        features: user.features || [] 
      };
      (currentUserChanges as any)[field] = value;
      newChanges.set(userId, currentUserChanges);
      return newChanges;
    });
  };
  const handleSaveChanges = () => {
    mutation.mutate(Array.from(userChanges.values()));
  };
  return (
    <Card className="backdrop-blur-xl shadow-glow hover:shadow-primary/30 transition-all duration-300">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <CardTitle>User Role Management</CardTitle>
          <p className="text-sm text-muted-foreground">Configure roles, status, and feature access for each user.</p>
        </div>
        <Button onClick={handleSaveChanges} disabled={userChanges.size === 0 || mutation.isPending} className="w-full md:w-auto h-12 shadow-primary hover:shadow-glow-lg transition-shadow">
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader><TableRow><TableHead>Username</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Features</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={4} className="text-center h-24">Loading users...</TableCell></TableRow>
               : users?.map(user => {
                  const changes = userChanges.get(user.id);
                  const currentRole = changes?.role ?? user.role;
                  const currentStatus = changes?.active ?? user.active;
                  const currentFeatures = changes?.features ?? user.features ?? [];
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        <Select value={currentRole} onValueChange={(role: User['role']) => handleFieldChange(user.id, 'role', role)}>
                          <SelectTrigger className="w-[140px] h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="operator">Operator</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="auditor">Auditor</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch checked={currentStatus} onCheckedChange={(active: boolean) => handleFieldChange(user.id, 'active', active)} />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="chat-access,fleet..."
                          value={currentFeatures.join(',')}
                          onChange={e => handleFieldChange(user.id, 'features', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                          className="h-10 w-full md:w-64"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
function EprReportingTab() {
  const { data: report, isLoading } = useQuery({
    queryKey: ['epr-report'],
    queryFn: () => api<EPRReport>('/api/epr-report'),
  });
  const streamData = report ? Object.entries(report.streams).map(([name, data]) => ({ name, ...data })) : [];
  const handleExportXml = () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<EPRReport date="${new Date().toISOString()}">
  <Summary>
    <CompliancePercentage>${report?.compliance_pct.toFixed(2)}</CompliancePercentage>
    <TotalFees>${report?.total_fees.toFixed(2)}</TotalFees>
  </Summary>
  <Streams>
    ${streamData.map(s => `<Stream name="${s.name}"><WeightKg>${s.weight}</WeightKg><FeesZAR>${s.fees}</FeesZAR></Stream>`).join('\n    ')}
  </Streams>
</EPRReport>`;
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'epr-report.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.info("PRO XML Export", { description: "A mock EPR report has been downloaded." });
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 backdrop-blur-xl shadow-glow hover:shadow-primary/30 transition-all duration-300">
        <CardHeader><CardTitle>Compliance Overview</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div className="text-4xl font-bold">{isLoading ? <Loader2 className="h-8 w-8 mx-auto animate-spin" /> : `${report?.compliance_pct.toFixed(1)}%`}</div>
            <p className="text-sm text-muted-foreground">WEEE Compliant Suppliers</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold">{isLoading ? <Loader2 className="h-8 w-8 mx-auto animate-spin" /> : `R ${report?.total_fees.toFixed(2)}`}</div>
            <p className="text-sm text-muted-foreground">Total EPR Fees Collected</p>
          </div>
          <Button onClick={handleExportXml} className="w-full h-14"><Download className="mr-2 h-4 w-4" /> Export PRO XML</Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2 backdrop-blur-xl shadow-glow hover:shadow-primary/30 transition-all duration-300">
        <CardHeader><CardTitle>Weight by EPR Stream (kg)</CardTitle></CardHeader>
        <CardContent>
          <Suspense fallback={<Loader2 className="animate-spin h-8 w-8 mx-auto" />}>
            <ResponsiveContainer width="100%" height={300}>
              {isLoading ? <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div> :
              <PieChart>
                <Pie data={streamData} dataKey="weight" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {streamData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>}
            </ResponsiveContainer>
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
export function Settings() {
  const user = useAuthStore(s => s.user);
  if (user?.role !== 'admin') {
    return (
      <PageLayout>
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have the required permissions to access the settings page.</AlertDescription>
        </Alert>
      </PageLayout>
    );
  }
  return (
    <PageLayout>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <Tabs defaultValue="roles" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
            <TabsTrigger value="roles">Role Configuration</TabsTrigger>
            <TabsTrigger value="epr">EPR Reporting</TabsTrigger>
          </TabsList>
          <TabsContent value="roles" className="mt-6 animate-fade-in">
            <UserRolesTable />
          </TabsContent>
          <TabsContent value="epr" className="mt-6 animate-fade-in">
            <EprReportingTab />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}