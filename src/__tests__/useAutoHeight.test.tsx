import { render, act } from '@testing-library/react-native';

import { useAutoHeight } from '../hooks/useAutoHeight';

type FrameCallback = (timestamp: number) => void;

const rafCallbacks: Array<FrameCallback | null> = [];
let requestAnimationFrameMock: jest.Mock<number, [FrameCallback]>;
let cancelAnimationFrameMock: jest.Mock<void, [number]>;

const installRequestAnimationFrame = () => {
  rafCallbacks.length = 0;
  let rafId = 0;

  requestAnimationFrameMock = jest.fn((callback: FrameCallback) => {
    rafCallbacks.push(callback);
    rafId += 1;
    return rafId;
  });

  cancelAnimationFrameMock = jest.fn((id: number) => {
    if (rafCallbacks[id - 1]) {
      rafCallbacks[id - 1] = null;
    }
  });

  (globalThis as unknown as Record<string, unknown>).requestAnimationFrame =
    requestAnimationFrameMock;
  (globalThis as unknown as Record<string, unknown>).cancelAnimationFrame =
    cancelAnimationFrameMock;
};

const flushRaf = () => {
  const callbacks = rafCallbacks.splice(0, rafCallbacks.length);
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  callbacks.forEach((callback) => callback && callback(now));
};

describe('useAutoHeight', () => {
  let latest: ReturnType<typeof useAutoHeight>;
  let onHeightChange: jest.Mock;

  const Harness: React.FC<{
    minHeight: number;
    onHeightChange?: (height: number) => void;
  }> = ({ minHeight, onHeightChange: handleHeightChange }) => {
    latest = useAutoHeight({ minHeight, onHeightChange: handleHeightChange });
    return null;
  };

  beforeEach(() => {
    installRequestAnimationFrame();
    onHeightChange = jest.fn();
  });

  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>)
      .requestAnimationFrame;
    delete (globalThis as unknown as Record<string, unknown>)
      .cancelAnimationFrame;
  });

  it('initialises with the provided minimum height and updates via payloads', () => {
    const { unmount } = render(
      <Harness minHeight={120} onHeightChange={onHeightChange} />
    );

    expect(latest.height).toBe(120);

    act(() => {
      latest.setHeightFromPayload('240');
    });

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    act(() => {
      flushRaf();
    });

    expect(latest.height).toBe(240);
    expect(onHeightChange).toHaveBeenLastCalledWith(240);
    unmount();
  });

  it('ignores invalid or insignificant height updates', () => {
    const { unmount } = render(
      <Harness minHeight={64} onHeightChange={onHeightChange} />
    );

    const initialHeight = latest.height;

    act(() => {
      latest.setHeightFromPayload('not-a-number');
    });

    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
    expect(latest.height).toBe(initialHeight);

    act(() => {
      latest.setHeightFromPayload(initialHeight + 1);
    });

    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
    expect(latest.height).toBe(initialHeight);
    unmount();
  });

  it('respects minHeight changes by scheduling a re-measure', () => {
    const { rerender, unmount } = render(
      <Harness minHeight={80} onHeightChange={onHeightChange} />
    );

    act(() => {
      rerender(<Harness minHeight={200} onHeightChange={onHeightChange} />);
    });

    act(() => {
      flushRaf();
    });

    expect(latest.height).toBe(200);
    expect(onHeightChange).toHaveBeenLastCalledWith(200);
    unmount();
  });

  it('deduplicates frame scheduling and commits the latest pending height', () => {
    const { unmount } = render(
      <Harness minHeight={100} onHeightChange={onHeightChange} />
    );

    act(() => {
      latest.setHeightFromPayload(180);
    });

    act(() => {
      latest.setHeightFromPayload(220);
    });

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    act(() => {
      flushRaf();
    });

    expect(latest.height).toBe(220);
    expect(onHeightChange).toHaveBeenLastCalledWith(220);
    unmount();
  });

  it('ignores stray flush callbacks when no pending height exists', () => {
    const { unmount } = render(
      <Harness minHeight={70} onHeightChange={onHeightChange} />
    );

    act(() => {
      latest.setHeightFromPayload(190);
    });

    const strayCallback = rafCallbacks[0];

    act(() => {
      flushRaf();
    });

    const committedHeight = latest.height;
    const callsAfterCommit = onHeightChange.mock.calls.length;

    act(() => {
      const now =
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      strayCallback?.(now);
    });

    expect(latest.height).toBe(committedHeight);
    expect(onHeightChange.mock.calls.length).toBe(callsAfterCommit);
    unmount();
  });

  it('cancels any pending animation frame on unmount', () => {
    const { unmount } = render(
      <Harness minHeight={90} onHeightChange={onHeightChange} />
    );

    act(() => {
      latest.setHeightFromPayload(300);
    });

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    act(() => {
      unmount();
    });

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
  });

  it('does not attempt to cancel when no frame is pending on unmount', () => {
    const { unmount } = render(
      <Harness minHeight={110} onHeightChange={onHeightChange} />
    );

    act(() => {
      unmount();
    });

    expect(cancelAnimationFrameMock).not.toHaveBeenCalled();
  });

  it('falls back to synchronous updates when requestAnimationFrame is unavailable', () => {
    delete (globalThis as unknown as Record<string, unknown>)
      .requestAnimationFrame;
    delete (globalThis as unknown as Record<string, unknown>)
      .cancelAnimationFrame;

    const { unmount } = render(
      <Harness minHeight={45} onHeightChange={onHeightChange} />
    );

    act(() => {
      latest.setHeightFromPayload(100);
    });

    expect(latest.height).toBe(100);
    expect(onHeightChange).toHaveBeenLastCalledWith(100);

    act(() => {
      unmount();
    });
  });
});
