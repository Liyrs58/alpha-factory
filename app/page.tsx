import LabApp from "@/components/LabApp";
import { demoPipeline } from "@/lib/agents/demo";

export default function Home() {
  return <LabApp initial={demoPipeline()} />;
}
