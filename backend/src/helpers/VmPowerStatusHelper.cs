using Azure.ResourceManager.Compute.Models;
using System;
using System.Linq;

namespace backend.src.helpers;

/// <summary>
/// Shared VM power status resolution used by both VmStatusPoller and Program.cs.
/// Previously duplicated across two files with nearly identical logic.
/// </summary>
public static class VmPowerStatusHelper
{
    public static string GetPowerStatus(VirtualMachineInstanceView instanceView)
    {
        var powerStatus = instanceView.Statuses
            .FirstOrDefault(status => status.Code.StartsWith("PowerState/", StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(powerStatus?.DisplayStatus))
        {
            var display = powerStatus.DisplayStatus.Trim();
            if (display.Equals("Deallocated", StringComparison.OrdinalIgnoreCase)) return "VM stopped";
            if (display.Equals("Deallocating", StringComparison.OrdinalIgnoreCase)) return "VM stopping";
            return display;
        }

        if (powerStatus?.Code is string powerCode)
        {
            return powerCode switch
            {
                _ when powerCode.Contains("running", StringComparison.OrdinalIgnoreCase) => "VM running",
                _ when powerCode.Contains("restarting", StringComparison.OrdinalIgnoreCase) => "VM restarting",
                _ when powerCode.Contains("starting", StringComparison.OrdinalIgnoreCase) => "VM starting",
                _ when powerCode.Contains("stopping", StringComparison.OrdinalIgnoreCase) => "VM stopping",
                _ when powerCode.Contains("deallocating", StringComparison.OrdinalIgnoreCase) => "VM stopping",
                _ when powerCode.Contains("deallocated", StringComparison.OrdinalIgnoreCase) => "VM stopped",
                _ when powerCode.Contains("stopped", StringComparison.OrdinalIgnoreCase) => "VM stopped",
                _ => "VM unknown"
            };
        }

        // No PowerState entry yet — check ProvisioningState for VMs that are still booting up
        var provisioningStatus = instanceView.Statuses
            .FirstOrDefault(status => status.Code.StartsWith("ProvisioningState/", StringComparison.OrdinalIgnoreCase));

        return provisioningStatus?.Code switch
        {
            string code when code.Contains("creating", StringComparison.OrdinalIgnoreCase) => "VM starting",
            string code when code.Contains("updating", StringComparison.OrdinalIgnoreCase) => "VM starting",
            string code when code.Contains("deleting", StringComparison.OrdinalIgnoreCase) => "VM stopping",
            string code when code.Contains("failed", StringComparison.OrdinalIgnoreCase) => "VM stopped",
            string code when code.Contains("succeeded", StringComparison.OrdinalIgnoreCase) => "VM running",
            _ => "VM unknown"
        };
    }

    public static bool IsRunningStatus(string status)
    {
        return status.Contains("running", StringComparison.OrdinalIgnoreCase);
    }
}
