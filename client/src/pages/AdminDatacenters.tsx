import { useState, useEffect, FormEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, KeyRound } from "lucide-react";

type Datacenter = {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  annualMWh: number;
  gridOperator: string;
  openDate: string;
};

const ADMIN_KEY_STORAGE = "gridtilt_admin_key";

type FormState = {
  name: string;
  company: string;
  city: string;
  state: string;
  lat: string;
  lng: string;
  powerMW: string;
  status: "operational" | "construction" | "announced";
  annualMWh: string;
  gridOperator: string;
  openDate: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  company: "",
  city: "",
  state: "",
  lat: "",
  lng: "",
  powerMW: "",
  status: "announced",
  annualMWh: "",
  gridOperator: "",
  openDate: "",
};

export default function AdminDatacenters() {
  const { toast } = useToast();
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      setAdminKey(saved);
      setKeyInput(saved);
    }
  }, []);

  const { data: datacenters = [], isLoading } = useQuery<Datacenter[]>({
    queryKey: ["/api/datacenters"],
    enabled: !!adminKey,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Datacenter, "id">) => {
      const res = await fetch("/api/admin/datacenters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: (created: Datacenter) => {
      toast({
        title: "Site added",
        description: `${created.name} created with id ${created.id}.`,
      });
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["/api/datacenters"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add site",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/datacenters/${id}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: (_data, id) => {
      toast({ title: "Site removed", description: `Deleted id ${id}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/datacenters"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function saveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      localStorage.removeItem(ADMIN_KEY_STORAGE);
      setAdminKey("");
      toast({ title: "Admin key cleared" });
      return;
    }
    localStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
    setAdminKey(trimmed);
    toast({ title: "Admin key saved" });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!adminKey) {
      toast({
        title: "Admin key required",
        description: "Enter your admin key before submitting.",
        variant: "destructive",
      });
      return;
    }
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const powerMW = parseFloat(form.powerMW);
    const annualMWh = parseFloat(form.annualMWh);
    if (
      !form.name ||
      !form.company ||
      !form.city ||
      !form.state ||
      !form.gridOperator ||
      !form.openDate ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(powerMW) ||
      !Number.isFinite(annualMWh)
    ) {
      toast({
        title: "Missing fields",
        description: "Fill every field with valid values.",
        variant: "destructive",
      });
      return;
    }
    if (powerMW < 400) {
      toast({
        title: "Below hyperscale threshold",
        description: "powerMW must be 400 or greater.",
        variant: "destructive",
      });
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast({
        title: "Coordinates out of range",
        description: "Latitude must be -90 to 90, longitude -180 to 180.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      company: form.company.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      lat,
      lng,
      powerMW,
      status: form.status,
      annualMWh,
      gridOperator: form.gridOperator.trim(),
      openDate: form.openDate.trim(),
    });
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const sortedDatacenters = [...datacenters].sort((a, b) => b.id - a.id);

  const keyCard = (
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold">Admin Key</h2>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="admin-key" className="text-xs text-muted-foreground">
              Sent as x-admin-key header. Stored in this browser only.
            </Label>
            <Input
              id="admin-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="ADMIN_API_KEY"
              data-testid="input-admin-key"
            />
          </div>
          <Button onClick={saveKey} data-testid="button-save-admin-key">
            Save
          </Button>
        </div>
        <p className="text-11 text-muted-foreground">
          Status:{" "}
          {adminKey ? (
            <span className="text-positive" data-testid="text-key-status">
              Key loaded
            </span>
          ) : (
            <span className="text-warning" data-testid="text-key-status">
              No key set
            </span>
          )}
        </p>
      </Card>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-admin-datacenters">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Admin · Hyperscale Sites</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Add or remove data center sites. Submissions write to the JSON registry and update the
          Power Map immediately.
        </p>
      </div>

      {keyCard}

      {!adminKey ? (
        <Card className="p-6 text-center" data-testid="card-locked">
          <p className="text-sm text-muted-foreground">
            Enter your admin key above to unlock the site editor.
          </p>
        </Card>
      ) : (
      <>
      <Card className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-add-datacenter">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold">Add New Site</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Reno Campus 03"
                data-testid="input-name"
              />
            </Field>
            <Field label="Company">
              <Input
                value={form.company}
                onChange={(e) => update("company", e.target.value)}
                placeholder="Microsoft"
                data-testid="input-company"
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                placeholder="Reno"
                data-testid="input-city"
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
                placeholder="NV"
                data-testid="input-state"
              />
            </Field>
            <Field label="Latitude">
              <Input
                type="number"
                step="any"
                value={form.lat}
                onChange={(e) => update("lat", e.target.value)}
                placeholder="39.5296"
                data-testid="input-lat"
              />
            </Field>
            <Field label="Longitude">
              <Input
                type="number"
                step="any"
                value={form.lng}
                onChange={(e) => update("lng", e.target.value)}
                placeholder="-119.8138"
                data-testid="input-lng"
              />
            </Field>
            <Field label="Power (MW)">
              <Input
                type="number"
                step="any"
                value={form.powerMW}
                onChange={(e) => update("powerMW", e.target.value)}
                placeholder="250"
                data-testid="input-powerMW"
              />
            </Field>
            <Field label="Annual MWh">
              <Input
                type="number"
                step="any"
                value={form.annualMWh}
                onChange={(e) => update("annualMWh", e.target.value)}
                placeholder="2190000"
                data-testid="input-annualMWh"
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value as FormState["status"])}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="select-status"
              >
                <option value="operational">Operational</option>
                <option value="construction">Construction</option>
                <option value="announced">Announced</option>
              </select>
            </Field>
            <Field label="Grid Operator">
              <Input
                value={form.gridOperator}
                onChange={(e) => update("gridOperator", e.target.value)}
                placeholder="WECC"
                data-testid="input-gridOperator"
              />
            </Field>
            <Field label="Open Date">
              <Input
                value={form.openDate}
                onChange={(e) => update("openDate", e.target.value)}
                placeholder="2026-Q3"
                data-testid="input-openDate"
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-submit-datacenter"
            >
              {createMutation.isPending ? "Adding..." : "Add Site"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Existing Sites</h2>
          <span className="text-xs text-muted-foreground" data-testid="text-site-count">
            {datacenters.length} total
          </span>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Company</th>
                  <th className="text-left py-2 px-2">Location</th>
                  <th className="text-right py-2 px-2">MW</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedDatacenters.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-border/40 hover:bg-muted/30"
                    data-testid={`row-datacenter-${d.id}`}
                  >
                    <td className="py-2 px-2 font-mono text-muted-foreground">{d.id}</td>
                    <td className="py-2 px-2 text-foreground">{d.name}</td>
                    <td className="py-2 px-2">{d.company}</td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {d.city}, {d.state}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">{d.powerMW}</td>
                    <td className="py-2 px-2 capitalize">{d.status}</td>
                    <td className="py-2 px-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (!adminKey) {
                            toast({
                              title: "Admin key required",
                              variant: "destructive",
                            });
                            return;
                          }
                          if (confirm(`Delete ${d.name}?`)) {
                            deleteMutation.mutate(d.id);
                          }
                        }}
                        data-testid={`button-delete-${d.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-negative" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
