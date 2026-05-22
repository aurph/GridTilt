import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowLeft, Share2, ExternalLink, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  date: string;
  keywords: string[];
  content: string;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: any[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      const text = line.slice(3);
      const id = slugify(text);
      elements.push(
        <h2 key={i} id={id} className="text-xl font-bold mt-10 mb-4 text-foreground scroll-mt-16">{text}</h2>
      );
    } else if (line.startsWith("### ")) {
      const text = line.slice(4);
      const id = slugify(text);
      elements.push(
        <h3 key={i} id={id} className="text-lg font-semibold mt-8 mb-3 text-foreground scroll-mt-16">{text}</h3>
      );
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <p key={i} className="text-sm font-semibold text-foreground mt-5 mb-2">{line.slice(2, -2)}</p>
      );
    } else if (line.startsWith("**")) {
      const parts = line.split(/(\*\*[^*]+\*\*)/);
      elements.push(
        <p key={i} className="text-[15px] text-muted-foreground leading-[1.7] mb-4">
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={j} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
            }
            const linkParts = part.split(/(\[[^\]]+\]\([^)]+\))/);
            return linkParts.map((lp, k) => {
              const linkMatch = lp.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
              if (linkMatch) {
                return <Link key={k} href={linkMatch[2]} className="text-[#F07800] hover:text-[#F0A500]">{linkMatch[1]}</Link>;
              }
              return lp;
            });
          })}
        </p>
      );
    } else if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-2 text-[15px] text-muted-foreground mb-5 ml-3 leading-[1.7]">
          {items.map((item, j) => <li key={j}>{renderInlineText(item)}</li>)}
        </ol>
      );
      continue;
    } else if (line.trim() === "") {
      // skip empty lines
    } else {
      const linkParts = line.split(/(\[[^\]]+\]\([^)]+\))/);
      elements.push(
        <p key={i} className="text-[15px] text-muted-foreground leading-[1.7] mb-4">
          {linkParts.map((part, j) => {
            const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (linkMatch) {
              return <Link key={j} href={linkMatch[2]} className="text-[#F07800] hover:text-[#F0A500]">{linkMatch[1]}</Link>;
            }
            return part;
          })}
        </p>
      );
    }
    i++;
  }

  return elements;
}

function renderInlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();

  const { data: article, isLoading, isError } = useQuery<BlogArticle>({
    queryKey: ["/api/blog", slug],
    queryFn: () => fetch(`/api/blog/${slug}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-[720px] mx-auto p-6 space-y-6">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-[720px] mx-auto p-6">
          <Card className="p-8 border-card-border text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <h1 className="text-lg font-semibold mb-2">Article Not Found</h1>
            <p className="text-sm text-muted-foreground">
              <Link href="/blog" className="text-[#F07800]">Browse all articles</Link>
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const toc = article.content
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3));

  const handleTocClick = (heading: string) => {
    const id = slugify(heading);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll-smooth" data-testid="blog-post-scroll-container">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-[720px] mx-auto px-6 py-2">
          <Link href="/blog" className="flex items-center gap-1.5 text-xs text-[#F07800] hover:text-[#F0A500]" data-testid="link-back-blog-sticky">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to articles
          </Link>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-6 pt-6 pb-16 space-y-6">
        <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
          <Link href="/" className="hover:text-foreground">GridTilt</Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-foreground">Analysis</Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{article.title}</span>
        </nav>

        <article>
          <header className="mb-8">
            <h1 className="text-2xl font-bold mb-3 leading-tight" data-testid="article-heading">{article.title}</h1>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(article.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
              {article.keywords.map((kw) => (
                <Badge key={kw} className="text-[10px] bg-muted/40 text-muted-foreground">{kw}</Badge>
              ))}
            </div>
            <p className="text-[15px] text-muted-foreground italic leading-[1.6]">{article.description}</p>
          </header>

          {toc.length > 2 && (
            <Card className="p-4 border-card-border mb-8" data-testid="table-of-contents">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Contents</h2>
              <ul className="space-y-1">
                {toc.map((heading, i) => (
                  <li key={i}>
                    <button
                      onClick={() => handleTocClick(heading)}
                      className="text-sm text-[#F07800] hover:text-[#F0A500] transition-colors text-left"
                      data-testid={`toc-link-${i}`}
                    >
                      {heading}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="prose-gridtilt" data-testid="article-content">
            {renderMarkdown(article.content)}
          </div>
        </article>

        <Card className="p-5 border-card-border" data-testid="article-cta">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Track this on GridTilt</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/overview" className="text-[#F07800] hover:text-[#F0A500]">Dashboard</Link>
            <Link href="/stack" className="text-[#F07800] hover:text-[#F0A500]">The Stack</Link>
            <Link href="/power-map" className="text-[#F07800] hover:text-[#F0A500]">Power Map</Link>
            <Link href="/trade" className="text-[#F07800] hover:text-[#F0A500]">Scenario Calculator</Link>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(`https://gridtilt.com/blog/${article.slug}`);
              toast({ title: "Link copied" });
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
            data-testid="button-copy-link"
          >
            <Share2 className="h-3 w-3" /> Copy Link
          </button>
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`https://gridtilt.com/blog/${article.slug}`)}&via=gridtilt`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
            data-testid="link-share-x"
          >
            Share on X <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <Link href="/blog" className="flex items-center gap-1 text-sm text-[#F07800] hover:text-[#F0A500]" data-testid="link-back-blog">
          <ArrowLeft className="h-4 w-4" /> All Articles
        </Link>
      </div>
    </div>
  );
}
