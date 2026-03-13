import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { User, LogOut, Shield, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Session Terminated",
        description: "Successfully logged out",
      });
      navigate("/signin");
    } catch (error) {
      console.error("Sign out error:", error);
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto w-full">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account and preferences</p>
        </div>

        <div className="grid gap-6 max-w-2xl mx-auto w-full">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border border-border bg-card p-6 space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Account Profile</h2>
                <p className="text-sm text-muted-foreground">System operator credentials</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Email Address</p>
                    <p className="text-sm font-medium text-foreground">{user?.email}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-secondary" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Authentication Status</p>
                    <p className="text-sm font-medium text-secondary">Active Session</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">User ID</p>
                    <p className="text-xs font-mono text-foreground break-all">{user?.uid}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Actions Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Session Management</h2>
              <p className="text-sm text-muted-foreground">Control your authentication session</p>
            </div>

            <Button
              variant="outline"
              size="lg"
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5 mr-2" />
              Sign Out
            </Button>
          </motion.div>

          {/* Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="rounded-xl border border-border/50 bg-muted/20 p-4"
          >
            <p className="text-xs text-muted-foreground leading-relaxed">
              This account has access to the fraud detection dashboard, transaction simulator, and system analytics. 
              Your session is secured with Firebase Authentication using industry-standard encryption protocols.
            </p>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
