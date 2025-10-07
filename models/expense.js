const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
    date: {
        type: Date,
        default: Date.now,
        required: true,
    },
    monthYear: {
        type: String, // Store as "YYYY-MM" to easily group by month
        required: true,
        unique: true, // Only one bill can be generated per month
    },
    kitchenRent: {
        type: Number,
        default: 0
    },
    kitchenExpense: {
        type: Number,
        default: 0
    },
    staffSalary: {
        type: Number,
        default: 0
    },
    totalExpense: {
        type: Number,
        required: true
    },
    ratePerDay: {
        type: Number,
        required: true
    },
    usersBilledCount: {
        type: Number,
        required: true
    }
}, { timestamps: true });

const Expense = mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
module.exports = Expense;