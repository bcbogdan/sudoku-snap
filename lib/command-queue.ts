export interface QueueStatus {
  pending: number;
  error: string;
}

// Stop on a failed commit rather than replaying subsequent input against stale state.
export class CommandQueue {
  private commands: (() => Promise<void>)[] = [];
  private running = false;
  private stopped = false;
  private disposed = false;
  constructor(private readonly notify: (status: QueueStatus) => void) {}
  enqueue(command: () => Promise<void>) {
    if (this.stopped || this.disposed) return;
    this.commands.push(command);
    this.publish();
    void this.drain();
  }
  reset() {
    this.stopped = false;
    this.publish();
  }
  dispose() {
    this.disposed = true;
    this.commands = [];
  }
  private publish(error = '') {
    if (!this.disposed)
      this.notify({ pending: this.commands.length + Number(this.running), error });
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.commands.length && !this.disposed) {
      const command = this.commands.shift()!;
      this.publish();
      try {
        await command();
      } catch (error) {
        this.commands = [];
        this.stopped = true;
        this.running = false;
        this.publish(
          `${error instanceof Error ? error.message : 'Could not save.'} Unsaved inputs were discarded. Resume editing and re-enter them, or reload if this puzzle changed in another tab.`,
        );
        return;
      }
    }
    this.running = false;
    this.publish();
  }
}
