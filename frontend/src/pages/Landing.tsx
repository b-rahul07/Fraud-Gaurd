import { motion } from "framer-motion";
import { Shield, Brain, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";

const features = [
  {
    icon: Brain,
    title: "GraphSAGE Networks",
    description: "Graph neural networks model transaction relationships and detect coordinated fraud patterns.",
  },
  {
    icon: Shield,
    title: "Autoencoder Detection",
    description: "Unsupervised learning detects anomalies through reconstruction error analysis.",
  },
  {
    icon: Zap,
    title: "On-Demand Inference",
    description: "Fast API scoring for transaction analysis.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6, ease: "easeOut" as const },
  }),
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background grid-pattern relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-200px] right-[-100px] w-[400px] h-[400px] rounded-full bg-secondary/5 blur-[100px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <Link to="/" className="flex items-center">
          <img src="/logo.png" alt="FraudGuard" className="h-9 w-auto object-contain" />
        </Link>
        <Button variant="outline" size="sm" onClick={() => navigate("/signin")}>
          Access System
        </Button>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-20 md:pt-28 md:pb-32 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-muted/50 text-muted-foreground text-xs font-medium mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse-glow" />
          Powered by Graph Neural Networks
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight tracking-tight text-foreground"
        >
          Detecting Fraud with
          <br />
          <span className="text-gradient">Data-Driven Intelligence</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
        >
          Hybrid deep learning system for proactive fraud detection.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-10 flex flex-col sm:flex-row gap-4"
        >
          <Button variant="hero" size="xl" onClick={() => navigate("/signin")}>
            Dashboard
            <ArrowRight className="ml-1 h-5 w-5" />
          </Button>
          <Button variant="outline" size="xl" onClick={() => navigate("/signin")}>
            Simulator
          </Button>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-16 grid grid-cols-3 gap-8 md:gap-16"
        >
          {[
            { value: "92%", label: "Model Recall" },
            { value: "<100ms", label: "Avg Processing Time" },
            { value: "120K+", label: "Transactions / Day" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="group rounded-2xl border border-border bg-card/50 p-6 transition-all duration-300 hover:bg-card/80 hover:border-primary/30 hover:neon-shadow"
            >
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
