import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowRight } from "lucide-react";

interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  date: string;
  keywords: string[];
}

export default function BlogIndex() {
  const { data: articles, isLoading } = useQuery<BlogArticle[]>({
    queryKey: ["/api/blog"],
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
          <Link href="/" className="hover:text-foreground">GridTilt</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Analysis</span>
        </nav>

        <div>
          <h1 className="text-2xl font-bold mb-2" data-testid="blog-heading">Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Research and analysis on the AI power infrastructure thesis. Data-driven, no hype.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {articles?.map((article) => (
              <Link key={article.slug} href={`/blog/${article.slug}`}>
                <Card className="p-5 border-card-border hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer" data-testid={`blog-card-${article.slug}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-foreground mb-1.5 leading-tight">{article.title}</h2>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{article.description}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                          <Calendar className="h-3 w-3" />
                          {new Date(article.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                        {article.keywords.slice(0, 2).map((kw) => (
                          <Badge key={kw} className="text-[10px] bg-muted/40 text-muted-foreground">{kw}</Badge>
                        ))}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-[#F07800] flex-shrink-0 mt-1" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
