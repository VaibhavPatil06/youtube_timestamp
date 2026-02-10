import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  publishedAt: Date,
  thumbnailUrl: String,
  duration: String,
  
  // Processing status
  status: {
    type: String,
    enum: ['New', 'InProgress', 'Complete', 'Failed'],
    default: 'New',
    index: true
  },
  
  // Processing flags
  transcriptGenerated: {
    type: Boolean,
    default: false
  },
  timestampGenerated: {
    type: Boolean,
    default: false
  },
  descriptionGenerated: {
    type: Boolean,
    default: false
  },
  subtitleGenerated: {
    type: Boolean,
    default: false
  },
  autoDubEnabled: {
    type: Boolean,
    default: false
  },
  
  // Error tracking
  retryCount: {
    type: Number,
    default: 0
  },
  lastError: String,
  
  // Processing metadata
  processedAt: Date,
  uploadedAt: Date
}, {
  timestamps: true
});

// Index for querying unprocessed videos
videoSchema.index({ status: 1, createdAt: 1 });

const Video = mongoose.model('Video', videoSchema);

export default Video;
