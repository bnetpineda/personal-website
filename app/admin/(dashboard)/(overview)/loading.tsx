import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeader } from "../../_components/shell";

/** The Overview's shape while it loads: its header, the headline numbers, then the three columns. */
export default function Loading() {
  return (
    <>
      <AdminHeader wide>
        <Skeleton className="h-9 w-64" />
      </AdminHeader>
      <main id="main-content" role="status" aria-label="Loading" className="mx-auto mb-safe flex w-full max-w-screen-2xl flex-1 flex-col gap-3 px-4 pt-4 pb-4 xl:min-h-0">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Skeleton className="col-span-2 h-24 md:col-span-4 xl:col-span-2" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-12 xl:grid-rows-1">
          <Skeleton className="h-72 xl:col-span-3 xl:h-auto" />
          <Skeleton className="order-last h-96 md:col-span-2 xl:order-none xl:col-span-6 xl:h-auto" />
          <div className="contents xl:col-span-3 xl:flex xl:flex-col xl:gap-3">
            <Skeleton className="h-56 xl:h-2/5" />
            <Skeleton className="h-56 md:col-span-2 xl:h-auto xl:flex-1" />
          </div>
        </div>
      </main>
    </>
  );
}
