import { redirect } from "next/navigation";

export default function Home() {
  // Nothing public lives at the root: cards are reached by their share link.
  redirect("/admin");
}
