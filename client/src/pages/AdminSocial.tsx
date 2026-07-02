import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Send, Sparkles, Trash2, ExternalLink, RefreshCw, Check, X as XIcon } from "lucide-react";

const ADMIN_KEY_STORAGE = "gridtilt_admin_key";
const TWEET_MAX = 280;

const TEMPLATES = [
  { name: "top_movers", label: "Top movers" },
  { name: "thesis_pulse", label: "Thesis pulse" },
  { name: "stack_spotlight", label: "Stack spotlight" },
  { name: "catalyst_lookahead", label: "Catalyst lookahead" },
  { name: "data_center_watch", label: "Data center watch" },
];

type SocialLogEntry = {
  timestamp: string;
  platform: "twitter";
  text: string;
  ok: boolean;
  id?: string;
  error?: string;
  dryRun?: boolean;
  template?: string;
  trigger?: "cron" | "manual";
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminSocial() {
  const { toast } = useToast();
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [composeText, setComposeText] = useState("");
  const [deleteId, setDeleteId] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      setAdminKey(saved);
      setKeyInput(saved);
    }
  }, []);

  const saveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    localStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
    setAdminKey(trimmed);
    toast({ title: "Admin key saved" });
  };

  const clearKey = () => {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setKeyInput("");
  };

  const logQuery = useQuery<SocialLogEntry[]>({
    queryKey: ["/api/admin/social-log"],
    queryFn: async () => {
      const res = await fetch("/api/admin/social-log?limit=50", {
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) throw new Error(`log fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!adminKey,
    refetchInterval: 15000,
  });

  const generateMutation = useMutation({
    mutationFn: async (template: string) => {
      const res = await fetch("/api/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `generate failed: ${res.status}`);
      }
      return res.json() as Promise<{ template: string; text: string; length: number }>;
    },
    onSuccess: (data) => {
      setComposeText(data.text);
      toast({ title: `Loaded "${data.template}"`, description: `${data.length} chars` });
    },
    onError: (e: any) => {
      toast({ title: "Generate failed", description: e?.message, variant: "destructive" });
    },
  });

  const postMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch("/api/admin/post-now", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `post failed: ${res.status}`);
      }
      return data as { ok: true; id: string; text: string };
    },
    onSuccess: (data) => {
      toast({
        title: "Posted",
        description: `Tweet id ${data.id}`,
      });
      setComposeText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/social-log"] });
    },
    onError: (e: any) => {
      toast({ title: "Post failed", description: e?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/tweet/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `delete failed: ${res.status}`);
      }
      return data as { ok: true; id: string; deleted: boolean };
    },
    onSuccess: (data) => {
      toast({ title: "Deleted", description: `Tweet ${data.id} removed` });
      setDeleteId("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/social-log"] });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    },
  });

  if (!adminKey) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand" />
            <h1 className="text-sm font-semibold">Admin key required</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste your ADMIN_API_KEY to access the social console.
          </p>
          <div className="space-y-2">
            <Label htmlFor="admin-key" className="text-xs">Admin key</Label>
            <Input
              id="admin-key"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="ADMIN_API_KEY"
              data-testid="input-admin-key"
            />
          </div>
          <Button onClick={saveKey} className="w-full" data-testid="button-save-admin-key">
            Save
          </Button>
        </Card>
      </div>
    );
  }

  const charCount = composeText.length;
  const overLimit = charCount > TWEET_MAX;
  const log = logQuery.data ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-page-title">Social console</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Generate, post, and audit @gridtilt activity.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearKey}
          className="text-xs text-muted-foreground"
          data-testid="button-clear-admin-key"
        >
          <KeyRound className="h-3 w-3 mr-1.5" />
          Sign out
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold">Compose</h2>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Load template</Label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <Button
                  key={t.name}
                  variant="outline"
                  size="sm"
                  onClick={() => generateMutation.mutate(t.name)}
                  disabled={generateMutation.isPending}
                  className="text-xs h-7"
                  data-testid={`button-template-${t.name}`}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-text" className="text-xs text-muted-foreground">
              Tweet text
            </Label>
            <textarea
              id="compose-text"
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder="What's happening in AI infra today..."
              rows={8}
              className="w-full font-mono text-sm rounded-[0.35rem] border border-border bg-background p-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              data-testid="input-compose-text"
            />
            <div className="flex items-center justify-between text-xs">
              <span
                className={overLimit ? "text-negative" : "text-muted-foreground"}
                data-testid="text-char-count"
              >
                {charCount} / {TWEET_MAX}
              </span>
              <Button
                onClick={() => postMutation.mutate(composeText.trim())}
                disabled={
                  !composeText.trim() ||
                  overLimit ||
                  postMutation.isPending
                }
                className="bg-brand hover:bg-brand/90 text-white"
                data-testid="button-post-tweet"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {postMutation.isPending ? "Posting..." : "Post to @gridtilt"}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold">Delete tweet</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste a tweet id to remove it from @gridtilt. Find ids in the log below.
          </p>
          <div className="space-y-2">
            <Label htmlFor="delete-id" className="text-xs text-muted-foreground">Tweet id</Label>
            <Input
              id="delete-id"
              value={deleteId}
              onChange={(e) => setDeleteId(e.target.value.trim())}
              placeholder="2056839400344936574"
              className="font-mono text-sm"
              data-testid="input-delete-id"
            />
          </div>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate(deleteId)}
            disabled={!deleteId || deleteMutation.isPending}
            className="w-full"
            data-testid="button-delete-tweet"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {deleteMutation.isPending ? "Deleting..." : "Delete from X"}
          </Button>
        </Card>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <Badge variant="outline" className="text-10 font-mono">
              {log.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logQuery.refetch()}
            disabled={logQuery.isFetching}
            className="text-xs"
            data-testid="button-refresh-log"
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${logQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {logQuery.isLoading && (
          <p className="text-xs text-muted-foreground">Loading log...</p>
        )}

        {!logQuery.isLoading && log.length === 0 && (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        )}

        <div className="space-y-2">
          {log.map((entry, i) => (
            <div
              key={`${entry.timestamp}-${i}`}
              className="border border-border rounded-[0.35rem] p-3 space-y-2"
              data-testid={`row-log-${i}`}
            >
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {entry.ok ? (
                  <Badge className="bg-positive-deep/20 text-positive border-positive-deep/40 text-10 gap-1">
                    <Check className="h-2.5 w-2.5" /> ok
                  </Badge>
                ) : (
                  <Badge className="bg-negative-deep/20 text-negative border-negative-deep/40 text-10 gap-1">
                    <XIcon className="h-2.5 w-2.5" /> fail
                  </Badge>
                )}
                {entry.dryRun && (
                  <Badge variant="outline" className="text-10">dry run</Badge>
                )}
                {entry.template && (
                  <Badge variant="outline" className="text-10">{entry.template}</Badge>
                )}
                {entry.trigger && (
                  <Badge variant="outline" className="text-10">{entry.trigger}</Badge>
                )}
                <span className="text-muted-foreground font-mono ml-auto">
                  {fmtTime(entry.timestamp)}
                </span>
              </div>

              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/90">
                {entry.text}
              </pre>

              {entry.error && (
                <pre className="text-11 text-negative whitespace-pre-wrap font-mono">
                  {entry.error}
                </pre>
              )}

              {entry.id && entry.ok && !entry.text.startsWith("(delete tweet") && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-muted-foreground">id {entry.id}</span>
                  <a
                    href={`https://x.com/gridtilt/status/${entry.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline inline-flex items-center gap-1"
                    data-testid={`link-tweet-${entry.id}`}
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    onClick={() => setDeleteId(entry.id!)}
                    className="text-muted-foreground hover:text-negative"
                    data-testid={`button-stage-delete-${entry.id}`}
                  >
                    Stage delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
