import mongoose from 'mongoose';

const apiUsageSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    index: true
  },
  unitsUsed: {
    type: Number,
    default: 0
  },
  dailyLimit: {
    type: Number,
    default: 9000
  },
  operations: [{
    operation: String,
    cost: Number,
    timestamp: {
      type: Date,
      default: Date.now
    },
    videoId: String
  }]
}, {
  timestamps: true
});

// Method to check if quota is available
apiUsageSchema.methods.hasQuotaAvailable = function(cost) {
  return (this.unitsUsed + cost) <= this.dailyLimit;
};

// Method to add usage
apiUsageSchema.methods.addUsage = function(operation, cost, videoId = null) {
  this.unitsUsed += cost;
  this.operations.push({ operation, cost, videoId });
  return this.save();
};

// Static method to get or create today's usage
apiUsageSchema.statics.getTodayUsage = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let usage = await this.findOne({ date: today });
  if (!usage) {
    usage = await this.create({ date: today });
  }
  return usage;
};

const APIUsage = mongoose.model('APIUsage', apiUsageSchema);

export default APIUsage;
