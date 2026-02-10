import mongoose from 'mongoose';

const timestampSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    index: true
  },
  videoTitle: {
    type: String,
    required: true
  },
  timestamp: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
timestampSchema.index({ videoId: 1, timestamp: 1 });

const Timestamp = mongoose.model('Timestamp', timestampSchema);

export default Timestamp;
