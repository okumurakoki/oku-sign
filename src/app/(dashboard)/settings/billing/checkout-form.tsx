'use client'

import { useState } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

interface Props {
  onSuccess: () => void
  amount: number
  interval?: 'monthly' | 'yearly'
}

// PaymentElementでアプリ内完結（Checkoutリダイレクトは使わない）
export function CheckoutForm({ onSuccess, amount, interval = 'monthly' }: Props) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required', // リダイレクトせずアプリ内で完結
    })

    if (error) {
      setError(error.message ?? '決済に失敗しました。カード情報をご確認ください')
      setSubmitting(false)
      return
    }
    // 成功（webhookでサブスクがactive化される）
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full h-11" disabled={!stripe || submitting}>
        {submitting ? '処理中...' : `${interval === 'yearly' ? '年額' : '月額'} ¥${amount.toLocaleString()} で登録する`}
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        いつでも解約できます。解約後は{interval === 'yearly' ? '当年度末' : '当月末'}まで利用可能です。
      </p>
    </form>
  )
}
