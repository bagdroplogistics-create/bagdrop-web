declare module 'razorpay' {
  interface RazorpayOptions {
    key_id: string
    key_secret: string
  }
  interface OrderCreateParams {
    amount: number
    currency: string
    receipt?: string
    notes?: Record<string, string>
  }
  interface RazorpayOrder {
    id: string
    amount: number
    currency: string
    receipt: string
  }
  class Razorpay {
    constructor(options: RazorpayOptions)
    orders: {
      create(params: OrderCreateParams): Promise<RazorpayOrder>
    }
  }
  export = Razorpay
}
