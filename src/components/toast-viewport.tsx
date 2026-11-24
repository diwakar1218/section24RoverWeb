"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, TriangleAlert, CircleAlert, X } from "lucide-react";
import { dismissNotice, type Notice } from "@/lib/notifications";

export function ToastViewport() {
  const [items, setItems] = useState<Notice[]>([]), viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function receive(event: Event) {
      const item = (event as CustomEvent<Notice>).detail;
      setItems(current => [...current.slice(-2), item]);
      const timer = setTimeout(() => { setItems(current => current.filter(n => n.id !== item.id)); timers.delete(timer); }, item.kind === "error" ? 9000 : 5500);
      timers.add(timer);
    }
    window.addEventListener("survey-notice", receive);
    return () => { window.removeEventListener("survey-notice", receive); timers.forEach(clearTimeout); };
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    // Put notices above native modal dialogs without moving keyboard focus.
    if (typeof node.showPopover === "function") {
      if (items.length) {if(node.matches(":popover-open"))node.hidePopover();node.showPopover();}
      else if (!items.length && node.matches(":popover-open")) node.hidePopover();
    } else node.removeAttribute("popover");
  }, [items]);
  return <div ref={viewport} popover="manual" className="toast-viewport" aria-label="Notifications">
    {items.map(item => {
      const Icon = item.kind === "success" ? CheckCircle2 : item.kind === "warning" ? TriangleAlert : CircleAlert;
      return <div key={item.id} className={`toast-card toast-${item.kind}`} data-kind={item.kind} role={item.kind === "error" ? "alert" : "status"}>
        <span className="toast-icon"><Icon size={23}/></span><div><strong>{item.kind === "success" ? "Success" : item.kind === "warning" ? "Please check" : "Unable to complete"}</strong><p>{item.message}</p></div>
        <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => {dismissNotice(item);setItems(current => current.filter(n => n.id !== item.id));}}><X size={17}/></button>
      </div>;
    })}
  </div>;
}
