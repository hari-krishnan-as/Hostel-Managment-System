const mongoose = require("mongoose");

const bannedIdSchema = new mongoose.Schema({
    // Store the unique identifier that was deleted
    hostelid: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    // Optional: Keep track of when and why it was banned
    bannedAt: { 
        type: Date, 
        default: Date.now 
    },
    reason: { 
        type: String, 
        default: 'Admin deletion' 
    }
});

// Register the model
const BannedId = mongoose.models.BannedId || mongoose.model("BannedId", bannedIdSchema);

module.exports = BannedId;