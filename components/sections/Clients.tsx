import { Section } from "@/components/Section";
import { ClientRail } from "@/components/ClientRail";
import { CLIENT_RAIL_MIN, clients } from "@/config/clients";
import { heroStats } from "@/config/site";

/**
 * The businesses rail under the hero. Renders nothing until there are enough
 * real, approved businesses in config/clients.ts to be worth a row.
 */
export function Clients() {
  if (clients.length < CLIENT_RAIL_MIN) return null;
  const installed = heroStats.find((s) => s.label === "Systems installed")?.value;
  const title = installed ? `A few of the ${installed} systems we've built` : "Systems we've built";

  return (
    <Section id="clients" className="border-t border-line py-12 sm:py-16">
      <ClientRail clients={clients} title={title} />
    </Section>
  );
}
