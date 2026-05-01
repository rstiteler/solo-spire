import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home, { LandingPage } from "@/pages/home";
import CampaignNew from "@/pages/campaign-new";
import GameView from "@/pages/game-view";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(35, 90%, 50%)",
    colorForeground: "hsl(45, 20%, 88%)",
    colorMutedForeground: "hsl(45, 10%, 55%)",
    colorDanger: "hsl(0, 70%, 55%)",
    colorBackground: "hsl(220, 20%, 10%)",
    colorInput: "hsl(220, 20%, 14%)",
    colorInputForeground: "hsl(45, 20%, 88%)",
    colorNeutral: "hsl(220, 15%, 30%)",
    fontFamily: "'Crimson Text', Georgia, serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(220,20%,10%)] border border-[hsl(220,15%,22%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl shadow-black/60",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(45,20%,88%)] font-serif text-2xl",
    headerSubtitle: "text-[hsl(45,10%,55%)]",
    socialButtonsBlockButtonText: "text-[hsl(45,20%,88%)] font-medium",
    formFieldLabel: "text-[hsl(45,20%,88%)]",
    footerActionLink: "text-[hsl(35,90%,50%)] hover:text-[hsl(35,90%,65%)]",
    footerActionText: "text-[hsl(45,10%,55%)]",
    dividerText: "text-[hsl(45,10%,55%)]",
    identityPreviewEditButton: "text-[hsl(35,90%,50%)]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[hsl(45,20%,88%)]",
    logoBox: "mx-auto mb-2",
    logoImage: "w-14 h-14",
    socialButtonsBlockButton: "border border-[hsl(220,15%,28%)] bg-[hsl(220,20%,14%)] hover:bg-[hsl(220,20%,18%)] transition-colors",
    formButtonPrimary: "bg-[hsl(35,90%,50%)] hover:bg-[hsl(35,90%,42%)] text-[hsl(220,20%,8%)] font-serif font-semibold tracking-wide",
    formFieldInput: "bg-[hsl(220,20%,14%)] border-[hsl(220,15%,28%)] text-[hsl(45,20%,88%)] placeholder:text-[hsl(45,10%,40%)]",
    footerAction: "border-t border-[hsl(220,15%,22%)]",
    dividerLine: "bg-[hsl(220,15%,25%)]",
    alert: "bg-[hsl(220,20%,14%)] border-[hsl(220,15%,28%)]",
    otpCodeFieldInput: "bg-[hsl(220,20%,14%)] border-[hsl(220,15%,28%)] text-[hsl(45,20%,88%)]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/campaigns" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function CampaignsPage() {
  return (
    <>
      <Show when="signed-in">
        <Home />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedCampaignNew() {
  return (
    <>
      <Show when="signed-in">
        <CampaignNew />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedGameView() {
  return (
    <>
      <Show when="signed-in">
        <GameView />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome Back, Adventurer",
            subtitle: "Sign in to continue your quest",
          },
        },
        signUp: {
          start: {
            title: "Begin Your Legend",
            subtitle: "Create an account to start your adventure",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/campaigns" component={CampaignsPage} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/campaign/new" component={ProtectedCampaignNew} />
            <Route path="/campaign/:id" component={ProtectedGameView} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
