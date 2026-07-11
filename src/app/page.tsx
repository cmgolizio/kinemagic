import { Header } from "@/components/Header";
import { Simulator } from "@/components/sim/Simulator";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col">
        <Simulator />
      </main>
    </div>
  );
}