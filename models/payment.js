const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
    // Reference to the user who made the payment
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    hostelid: { // For easy lookup
        type: String,
        required: true,
    },
    // The date/month of the bill being paid (e.g., "October 2025")
    billingCycle: {
        type: String, 
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    // Status can be 'Completed', 'Failed', 'Pending'
    status: {
        type: String,
        enum: ['Completed', 'Failed', 'Pending'],
        default: 'Completed'
    },
    presentDays: {
        type: Number,
        default: 0
    },
    // Razorpay Fields for transaction tracking and verification
    razorpayPaymentId: {
        type: String,
        sparse: true 
    },
    razorpayOrderId: {
        type: String,
        sparse: true
    },
    // Timestamp of when the payment was recorded
    paymentDate: {
        type: Date,
        default: Date.now,
    }
}, { timestamps: true });

// Ensure a user can only pay a specific cycle once successfully
// This index will prevent duplicate payment entries for the same user and bill cycle.
paymentSchema.index({ userId: 1, billingCycle: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'Completed' } });

const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
module.exports = Payment;