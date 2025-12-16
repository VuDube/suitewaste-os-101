import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Supplier } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "sonner";
import { PlusCircle, Trash2, Search, Loader2, ShieldAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import { PageLayout } from "@/components/PageLayout";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useAuthStore } from "@/stores/useAuthStore";
type SupplierFormData = Omit<Supplier, 'id' | 'created_at' | 'updated_at'>;
const PAGE_SIZE = 10;
export function SupplierDirectory() {
  const user = useAuthStore(s => s.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<Supplier[]>('/api/suppliers'),
    enabled: !!user,
  });
  const createMutation = useMutation({
    mutationFn: (newSupplier: SupplierFormData) => api<Supplier>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(newSupplier),
    }),
    onSuccess: () => {
      toast.success("Supplier created successfully!");
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Failed to create supplier", { description: error.message });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<{ id: string, deleted: boolean }>(`/api/suppliers/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: (data) => {
      if (data.deleted) {
        toast.success("Supplier deleted successfully!");
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      } else {
        toast.warning("Supplier not found or already deleted.");
      }
    },
    onError: (error) => {
      toast.error("Failed to delete supplier", { description: error.message });
    },
  });
  const { register, handleSubmit, reset } = useForm<SupplierFormData>();
  const onSubmit = (data: SupplierFormData) => {
    createMutation.mutate(data);
    reset();
  };
  const filteredSuppliers = suppliers?.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  ) || [];
  const totalPages = Math.ceil(filteredSuppliers.length / PAGE_SIZE);
  const paginatedSuppliers = filteredSuppliers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (!canManage) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to view or manage suppliers.</p>
        </div>
      </PageLayout>
    );
  }
  return (
    <PageLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Supplier Directory</h1>
        <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button className="w-full sm:w-auto h-14"><PlusCircle className="mr-2 h-4 w-4" /> Add Supplier</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Supplier</DialogTitle>
              <DialogDescription>Enter supplier details for EPR compliance and transaction records.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input placeholder="Supplier Name" {...register("name", { required: true })} className="h-14" />
              <Input placeholder="Contact Person" {...register("contact_person")} className="h-14" />
              <Input placeholder="Phone Number" {...register("phone_number")} className="h-14" />
              <Input placeholder="Email" type="email" {...register("email")} className="h-14" />
              <Input placeholder="EPR Number" {...register("epr_number")} className="h-14" />
              <div className="flex items-center space-x-2 h-12"><Checkbox id="weee_compliant" {...register("is_weee_compliant")} /><Label htmlFor="weee_compliant">WEEE Compliant</Label></div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full h-14">{createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Supplier</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-md h-14 pl-10" />
      </div>
      <div className="overflow-x-auto border rounded-lg min-w-full">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>EPR Number</TableHead><TableHead>WEEE Compliant</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? (<TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>)
             : paginatedSuppliers.length ? (paginatedSuppliers.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.epr_number || 'N/A'}</TableCell>
                  <TableCell>{s.is_weee_compliant ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{s.contact_person || 'N/A'}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)} disabled={deleteMutation.isPending && deleteMutation.variables === s.id}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              )))
             : (<TableRow><TableCell colSpan={5} className="text-center">No suppliers found.</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <Pagination className="mt-6">
          <PaginationContent>
            <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }} /></PaginationItem>
            {[...Array(totalPages)].map((_, i) => (
              <PaginationItem key={i}><PaginationLink href="#" isActive={page === i + 1} onClick={(e) => { e.preventDefault(); setPage(i + 1); }}>{i + 1}</PaginationLink></PaginationItem>
            ))}
            <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
      <Toaster richColors theme="dark" />
    </PageLayout>
  );
}