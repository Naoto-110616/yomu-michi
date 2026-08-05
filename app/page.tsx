import Atlas from '@/components/Atlas'
import payload from '@/data/graph.json'
import type { Payload } from '@/lib/graph'

export default function Page() {
  return (
    <main className="h-dvh">
      <Atlas payload={payload as unknown as Payload} />
    </main>
  )
}
