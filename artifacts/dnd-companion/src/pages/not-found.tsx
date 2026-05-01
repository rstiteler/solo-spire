import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <div className="font-serif text-6xl font-bold text-primary/30 mb-4">404</div>
        <h1 className="font-serif text-2xl text-foreground mb-2">Lost in the Dungeon</h1>
        <p className="text-muted-foreground mb-6">This path leads nowhere. Turn back, adventurer.</p>
        <Button onClick={() => setLocation("/")} className="bg-primary text-primary-foreground hover:bg-primary/90 font-serif">
          Return to Safety
        </Button>
      </div>
    </div>
  );
}
