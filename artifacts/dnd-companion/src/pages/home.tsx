import { useListCampaigns, useDeleteCampaign } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Plus, Trash2, Play, BookOpen, Swords, Shield, Scroll } from "lucide-react";
import { useClerk, useUser } from "@clerk/react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: campaigns, isLoading } = useListCampaigns();
  const deleteCampaign = useDeleteCampaign();
  const { signOut } = useClerk();
  const { user } = useUser();

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this campaign? This cannot be undone.")) {
      await deleteCampaign.mutateAsync({ id });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        <header className="flex justify-between items-end border-b border-border pb-6">
          <div>
            <h1 className="text-4xl font-serif font-bold text-primary mb-2">Grimoire of Adventures</h1>
            <p className="text-muted-foreground italic">
              Welcome back, {user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "Adventurer"}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/campaign/new">
              <Button size="lg" className="gap-2 font-serif tracking-wide bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-5 h-5" />
                New Campaign
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              onClick={() => signOut(() => setLocation("/"))}
              className="border-border text-muted-foreground hover:text-foreground hover:border-foreground"
            >
              Sign Out
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card/50 border-border">
                <CardHeader>
                  <Skeleton className="h-6 w-2/3 bg-muted" />
                  <Skeleton className="h-4 w-1/3 bg-muted" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : campaigns?.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/20">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-serif text-muted-foreground mb-2">The pages are blank.</h3>
            <p className="text-sm text-muted-foreground mb-6">Your legend has yet to be written.</p>
            <Link href="/campaign/new">
              <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                Start a New Adventure
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns?.map((campaign) => (
              <Card key={campaign.id} className="bg-card border-card-border hover:border-primary transition-colors duration-300 flex flex-col group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                  <CardTitle className="font-serif text-2xl text-foreground group-hover:text-primary transition-colors">
                    {campaign.name}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Level {campaign.level}{campaign.currentLocation ? ` • ${campaign.currentLocation}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Last played: {campaign.lastPlayedAt ? format(new Date(campaign.lastPlayedAt), "MMM d, yyyy") : "Never"}</p>
                    <p>XP: {campaign.xp.toLocaleString()}</p>
                    <p>Gold: {campaign.gold.toLocaleString()} gp</p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between relative z-10 pt-4 border-t border-border/50">
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(campaign.id)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Link href={`/campaign/${campaign.id}`}>
                    <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-serif">
                      <Play className="w-4 h-4 fill-current" />
                      Resume
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <img src="/logo.svg" alt="Solo Spire" className="w-24 h-24 mx-auto mb-6 opacity-90" />
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-primary mb-4">Solo Spire</h1>
          <p className="text-xl text-muted-foreground italic max-w-2xl mx-auto">
            An AI-powered Dungeon Master for your solo D&amp;D 5e adventures. No party required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 w-full max-w-3xl">
          {[
            { icon: Swords, title: "AI Dungeon Master", desc: "Claude narrates your world, runs combat, and adapts to every choice." },
            { icon: Shield, title: "Full Character Sheet", desc: "Track HP, spells, conditions, inventory, and level-ups automatically." },
            { icon: Scroll, title: "Persistent Campaigns", desc: "Your story is saved. Pick up any time, right where you left off." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-lg p-6 text-left">
              <Icon className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-serif text-lg text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <Button
            size="lg"
            onClick={() => setLocation("/sign-up")}
            className="font-serif tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 px-8"
          >
            Begin Your Legend
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setLocation("/sign-in")}
            className="font-serif border-border text-foreground hover:border-primary hover:text-primary px-8"
          >
            Sign In
          </Button>
        </div>
      </div>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Solo Spire — A D&amp;D 5e Companion
      </footer>
    </div>
  );
}
