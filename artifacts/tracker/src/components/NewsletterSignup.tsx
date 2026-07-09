import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Mail, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCreateSubscriber } from "@workspace/api-client-react"

const schema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." })
})

export function NewsletterSignup() {
  const [isSuccess, setIsSuccess] = useState(false)
  const createSubscriber = useCreateSubscriber()
  
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" }
  })

  const onSubmit = (values: z.infer<typeof schema>) => {
    createSubscriber.mutate({ data: { email: values.email } }, {
      onSuccess: () => {
        setIsSuccess(true)
        form.reset()
      }
    })
  }

  return (
    <section className="border-t bg-primary/5 py-16 lg:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?q=80&w=2000&auto=format&fit=crop')] opacity-[0.03] mix-blend-overlay bg-cover bg-center" />
      
      <div className="container mx-auto max-w-2xl px-4 relative z-10">
        <div className="text-center space-y-4 mb-8">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Never Miss a Drop.
          </h2>
          <p className="text-muted-foreground md:text-lg">
            Weekly digest of new drops, preorder alerts, and collector news. 
            Direct to your inbox.
          </p>
        </div>

        {isSuccess ? (
          <div className="bg-background border border-primary/20 rounded-lg p-6 text-center space-y-3 animate-in fade-in zoom-in duration-500">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h3 className="font-display text-xl font-bold">You're on the list</h3>
            <p className="text-muted-foreground text-sm">Keep an eye out for our next dispatch.</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsSuccess(false)}>
              Subscribe another email
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                {...form.register("email")}
                placeholder="your@email.com" 
                className="pl-9 h-12 bg-background border-primary/20 focus-visible:ring-primary"
                disabled={createSubscriber.isPending}
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-xs mt-1 absolute -bottom-5">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <Button 
              type="submit" 
              size="lg" 
              className="h-12 font-bold tracking-wide shrink-0 shadow-lg shadow-primary/20"
              disabled={createSubscriber.isPending}
            >
              {createSubscriber.isPending ? "Subscribing..." : "Get the Newsletter"}
            </Button>
          </form>
        )}
        
        <p className="text-center text-xs text-muted-foreground/60 mt-8 font-mono">
          A Beehiiv embed will replace this form once the newsletter account is set up.
        </p>
      </div>
    </section>
  )
}
