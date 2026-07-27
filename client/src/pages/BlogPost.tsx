import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Share2, ExternalLink, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/editorial";

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
        <h2 key={i} id={id} className="font-serif font-medium text-[24px] mt-10 mb-4 text-ink scroll-mt-16">{text}</h2>
      );
    } else if (line.startsWith("### ")) {
      const text = line.slice(4);
      const id = slugify(text);
      elements.push(
        <h3 key={i} id={id} className="text-[17px] font-semibold mt-8 mb-3 text-ink scroll-mt-16">{text}</h3>
      );
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <p key={i} className="text-[15px] font-semibold text-ink mt-5 mb-2">{line.slice(2, -2)}</p>
      );
    } else if (line.startsWith("**")) {
      const parts = line.split(/(\*\*[^*]+\*\*)/);
      elements.push(
        <p key={i} className="text-[15.5px] text-ink-secondary leading-[1.75] mb-4">
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={j} className="text-ink font-semibold">{part.slice(2, -2)}</strong>;
            }
            const linkParts = part.split(/(\[[^\]]+\]\([^)]+\))/);
            return linkParts.map((lp, k) => {
              const linkMatch = lp.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
              if (linkMatch) {
                return <Link key={k} href={linkMatch[2]} className="text-brand-ink underline decoration-rule-strong underline-offset-2 hover:text-ink">{linkMatch[1]}</Link>;
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
        <ol key={`ol-${i}`} className="list-decimal list-inside space-y-2 text-[15.5px] text-ink-secondary mb-5 ml-3 leading-[1.75]">
          {items.map((item, j) => <li key={j}>{renderInlineText(item)}</li>)}
        </ol>
      );
      continue;
    } else if (line.trim() === "") {
      // skip empty lines
    } else {
      const linkParts = line.split(/(\[[^\]]+\]\([^)]+\))/);
      elements.push(
        <p key={i} className="text-[15.5px] text-ink-secondary leading-[1.75] mb-4">
          {linkParts.map((part, j) => {
            const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (linkMatch) {
              return <Link key={j} href={linkMatch[2]} className="text-brand-ink underline decoration-rule-strong underline-offset-2 hover:text-ink">{linkMatch[1]}</Link>;
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
      return <strong key={i} className="text-ink font-semibold">{part.slice(2, -2)}</strong>;
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
      <PageShell>
        <div className="max-w-[720px] mx-auto pt-8 space-y-6">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageShell>
    );
  }

  if (isError || !article) {
    return (
      <PageShell>
        <div className="max-w-[720px] mx-auto pt-16 text-center">
          <AlertTriangle className="h-8 w-8 text-negative mx-auto mb-3" />
          <h1 className="font-serif text-[26px] font-medium mb-2 text-ink">Article not found</h1>
          <p className="text-[14px] text-ink-secondary">
            <Link href="/blog" className="text-brand-ink">Browse all articles</Link>
          </p>
        </div>
      </PageShell>
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
    <PageShell>
      <div className="max-w-[720px] mx-auto" data-testid="blog-post-scroll-container">
        <nav className="pt-6 text-[12.5px] text-ink-muted" data-testid="breadcrumb">
          <Link href="/blog" className="flex items-center gap-1.5 text-brand-ink no-underline hover:text-ink" data-testid="link-back-blog-sticky">
            <ArrowLeft className="h-3.5 w-3.5" /> All analysis
          </Link>
        </nav>

        <article className="pt-5">
          <header className="mb-8 border-b border-rule pb-6">
            <h1 className="font-serif font-medium text-[32px] sm:text-[38px] leading-[1.1] tracking-tight text-ink mb-3" data-testid="article-heading">
              {article.title}
            </h1>
            <p className="font-serif italic text-[16.5px] text-ink-secondary leading-relaxed mb-3">{article.description}</p>
            <p className="text-[12.5px] text-ink-muted">
              {/* noon anchor: bare YYYY-MM-DD parses as UTC midnight and shifts a day back in US time zones */}
              {new Date(`${article.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              {article.keywords.length > 0 && <> · {article.keywords.slice(0, 4).join(" · ")}</>}
            </p>
          </header>

          {toc.length > 2 && (
            <nav className="mb-8 border-l-2 border-rule pl-4" data-testid="table-of-contents">
              <p className="text-[13px] font-semibold text-ink mb-1.5">Contents</p>
              <ul className="space-y-1">
                {toc.map((heading, i) => (
                  <li key={i}>
                    <button
                      onClick={() => handleTocClick(heading)}
                      className="text-[14px] text-brand-ink hover:text-ink transition-colors text-left"
                      data-testid={`toc-link-${i}`}
                    >
                      {heading}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="prose-gridtilt" data-testid="article-content">
            {renderMarkdown(article.content)}
          </div>
        </article>

        <div className="mt-10 border-t-2 border-rule-strong pt-5" data-testid="article-cta">
          <p className="text-[13.5px] font-semibold text-ink mb-2">Track this on GridTilt</p>
          <div className="flex flex-wrap gap-4 text-[13.5px]">
            <Link href="/overview" className="text-brand-ink no-underline hover:text-ink">Today</Link>
            <Link href="/stack" className="text-brand-ink no-underline hover:text-ink">The Stack</Link>
            <Link href="/power-map" className="text-brand-ink no-underline hover:text-ink">Power</Link>
            <Link href="/trade" className="text-brand-ink no-underline hover:text-ink">Scenario worksheet</Link>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(`https://gridtilt.com/blog/${article.slug}`);
              toast({ title: "Link copied" });
            }}
            className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-sm border border-rule hover:border-rule-strong transition-colors"
            data-testid="button-copy-link"
          >
            <Share2 className="h-3 w-3" /> Copy link
          </button>
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(`https://gridtilt.com/blog/${article.slug}`)}&via=gridtilt`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-sm border border-rule hover:border-rule-strong transition-colors"
            data-testid="link-share-x"
          >
            Share on X <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <Link href="/blog" className="mt-8 mb-4 flex items-center gap-1 text-[14px] text-brand-ink no-underline hover:text-ink" data-testid="link-back-blog">
          <ArrowLeft className="h-4 w-4" /> All analysis
        </Link>
      </div>
    </PageShell>
  );
}
